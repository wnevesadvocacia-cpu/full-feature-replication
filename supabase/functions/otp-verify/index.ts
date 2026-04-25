// OTP Verify - valida código numérico e gera link de sessão (magic link admin) para o cliente trocar por sessão
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_ATTEMPTS = 5;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, code } = await req.json();
    if (!email || !code || typeof email !== 'string' || typeof code !== 'string') {
      return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const normalized = email.trim().toLowerCase();
    const cleanCode = code.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      return new Response(JSON.stringify({ error: 'invalid_code_format' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Busca o código mais recente, não usado e não expirado
    const { data: rows, error: selErr } = await admin
      .from('otp_codes')
      .select('*')
      .eq('email', normalized)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (selErr) {
      console.error('select otp error', selErr);
      return new Response(JSON.stringify({ error: 'db_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ error: 'code_expired_or_not_found' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const otpRow = rows[0];
    if (otpRow.attempts >= MAX_ATTEMPTS) {
      await admin.from('otp_codes').update({ used: true }).eq('id', otpRow.id);
      return new Response(JSON.stringify({ error: 'too_many_attempts' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const expectedHash = await sha256(`${normalized}:${cleanCode}`);
    if (expectedHash !== otpRow.code_hash) {
      await admin.from('otp_codes').update({ attempts: otpRow.attempts + 1 }).eq('id', otpRow.id);
      const remaining = MAX_ATTEMPTS - (otpRow.attempts + 1);
      return new Response(JSON.stringify({ error: 'invalid_code', remaining_attempts: Math.max(0, remaining) }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Marca como usado
    await admin.from('otp_codes').update({ used: true }).eq('id', otpRow.id);

    // Gera magic link para trocar por sessão no client
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: normalized,
    });
    if (linkErr || !linkData) {
      console.error('generateLink error', linkErr);
      return new Response(JSON.stringify({ error: 'link_generation_failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Retorna o hashed_token + email para o client chamar verifyOtp(type:'magiclink')
    const props = linkData.properties as { hashed_token?: string; email_otp?: string };
    return new Response(JSON.stringify({
      ok: true,
      email: normalized,
      token_hash: props.hashed_token,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('otp-verify error', e);
    return new Response(JSON.stringify({ error: 'internal_error', message: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
