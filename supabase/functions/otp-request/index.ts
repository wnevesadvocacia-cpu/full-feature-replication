// OTP Request - valida senha, gera código de 6 dígitos e envia via Resend
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const OTP_TTL_MINUTES = 5;
const RESEND_FROM = 'WnevesBox <onboarding@resend.dev>';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateCode(): string {
  // 6 dígitos numéricos, com zeros à esquerda
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

function emailHtml(code: string) {
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f4f6fa;margin:0;padding:32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
    <tr><td style="padding:28px 32px;background:#0f172a;color:#ffffff;">
      <h1 style="margin:0;font-size:18px;font-weight:600;">WnevesBox · Código de acesso</h1>
    </td></tr>
    <tr><td style="padding:32px;color:#0f172a;">
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#475569;">Use o código abaixo para concluir seu login. Ele expira em <strong>${OTP_TTL_MINUTES} minutos</strong>.</p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:36px;letter-spacing:10px;font-weight:700;color:#0f172a;background:#f1f5f9;padding:16px 24px;border-radius:8px;">${code}</span>
      </div>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">Se você não solicitou este código, ignore este email. Ninguém conseguirá acessar sua conta sem ele.</p>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, password } = await req.json();
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const normalized = email.trim().toLowerCase();

    // 1) Valida credenciais via signInWithPassword (não persiste sessão server-side)
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({ email: normalized, password });
    if (signInError || !signInData.user) {
      return new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // descarta sessão imediatamente
    await anonClient.auth.signOut();

    // 2) Gera e armazena hash do código
    const code = generateCode();
    const codeHash = await sha256(`${normalized}:${code}`);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Invalida códigos anteriores do mesmo email
    await adminClient.from('otp_codes').update({ used: true }).eq('email', normalized).eq('used', false);

    const { error: insertError } = await adminClient.from('otp_codes').insert({
      email: normalized, code_hash: codeHash, expires_at: expiresAt,
    });
    if (insertError) {
      console.error('insert otp_codes error', insertError);
      return new Response(JSON.stringify({ error: 'db_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3) Envia email via Resend
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [normalized],
        subject: `Código de acesso WnevesBox: ${code}`,
        html: emailHtml(code),
      }),
    });

    if (!resendResp.ok) {
      const txt = await resendResp.text();
      console.error('resend error', resendResp.status, txt);
      return new Response(JSON.stringify({ error: 'email_send_failed', detail: txt }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, expires_at: expiresAt }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('otp-request error', e);
    return new Response(JSON.stringify({ error: 'internal_error', message: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
