// Verify OTP via Resend pipeline — valida código numérico e devolve token_hash p/ verifyOtp no client.
// S13: CORS allowlist. S22: comparação constant-time via crypto.subtle em buffer hex fixo.
// S2 + S8: integra auth_lockouts — registra falha e reseta em sucesso.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from '../_shared/cors.ts';
import { maskEmail, timingSafeEqualHex } from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_ATTEMPTS = 5;

const BodySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{6}$/),
});

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const blocked = rejectIfDisallowedOrigin(req);
  if (blocked) return blocked;
  const cors = corsHeadersFor(req);

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const code = parsed.data.code;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: rows, error: selectError } = await admin
      .from('otp_codes')
      .select('*')
      .eq('email', email)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (selectError) {
      console.error('select otp error', selectError);
      return new Response(JSON.stringify({ error: 'db_error' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ error: 'code_expired_or_not_found' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const otpRow = rows[0];
    if (otpRow.attempts >= MAX_ATTEMPTS) {
      await admin.from('otp_codes').update({ used: true }).eq('id', otpRow.id);
      return new Response(JSON.stringify({ error: 'too_many_attempts' }), {
        status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const expectedHash = await sha256(`${email}:${code}`);
    if (!timingSafeEqualHex(expectedHash, otpRow.code_hash)) {
      await admin.from('otp_codes').update({ attempts: otpRow.attempts + 1 }).eq('id', otpRow.id);
      // S2+S8: registra falha no lockout (15min após 5 falhas)
      await admin.rpc('register_otp_failure', { _email: email, _max: 5, _block_minutes: 15 });
      const remaining = MAX_ATTEMPTS - (otpRow.attempts + 1);
      console.warn('verify-otp-resend invalid code', { email_masked: maskEmail(email) });
      return new Response(JSON.stringify({ error: 'invalid_code', remaining_attempts: Math.max(0, remaining) }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    await admin.from('otp_codes').update({ used: true }).eq('id', otpRow.id);
    // S2+S8: sucesso — reseta lockout
    await admin.rpc('reset_otp_lockout', { _email: email });

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink', email,
    });

    if (linkError || !linkData) {
      console.error('generateLink error', linkError);
      return new Response(JSON.stringify({ error: 'link_generation_failed' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const props = linkData.properties as { hashed_token?: string };
    return new Response(JSON.stringify({ ok: true, email, token_hash: props.hashed_token }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('verify-otp-resend error', error);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
