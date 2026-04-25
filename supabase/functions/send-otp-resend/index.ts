// Send OTP via Resend — código de 6 dígitos, hash SHA-256.
// S13: CORS allowlist.
// S9 + S25: anti-enumeration — sempre devolve {success:true} mesmo se email não existir
//          em auth.users. Evita criar conta nova quando disable_signup=true.
// S2 + S8: bloqueio 15min após 5 falhas (auth_lockouts) + rate-limit por IP (10/h).
// S26: logs com email mascarado.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from '../_shared/cors.ts';
import { maskEmail, getClientIp, hashIp } from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OTP_TTL_MINUTES = 10;
const IP_RATE_MAX = 10;          // máx 10 reqs por IP
const IP_RATE_WINDOW_MIN = 60;   // janela 60min

const BodySchema = z.object({ email: z.string().trim().email() });

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateCode(): string {
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
        <span style="display:inline-block;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:42px;letter-spacing:12px;font-weight:700;color:#0f172a;background:#f1f5f9;padding:20px 28px;border-radius:8px;">${code}</span>
      </div>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">Se você não solicitou este código, ignore este email.</p>
    </td></tr>
  </table>
</body></html>`;
}

function lockoutEmailHtml() {
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f4f6fa;margin:0;padding:32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:28px 32px;background:#7c2d12;color:#ffffff;"><h1 style="margin:0;font-size:18px;font-weight:600;">⚠ Conta bloqueada temporariamente</h1></td></tr>
    <tr><td style="padding:32px;color:#0f172a;">
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Detectamos múltiplas tentativas inválidas de login na sua conta. Por segurança, bloqueamos novas tentativas pelos próximos <strong>15 minutos</strong>.</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Se não foi você, recomendamos monitorar acessos suspeitos.</p>
      <p style="margin:0;font-size:12px;color:#94a3b8;">WnevesBox · Notificação automática de segurança.</p>
    </td></tr>
  </table>
</body></html>`;
}

/** S25 — verifica se o email existe em auth.users via admin API. */
async function emailExists(admin: any, email: string): Promise<boolean> {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !data) return false;
    if (data.users.some((u: any) => u.email?.toLowerCase() === email)) return true;
    if (data.users.length < 100) return false;
    page++;
  }
  return false;
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: (() => {
        const raw = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@wnevesbox.com';
        const match = raw.match(/<([^>]+)>/);
        const addr = match ? match[1] : raw;
        return `WnevesBox <${addr}>`;
      })(),
      to: [to], subject, html,
    }),
  });
  if (!resendResp.ok) {
    console.error('resend send failed', resendResp.status);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const blocked = rejectIfDisallowedOrigin(req);
  if (blocked) return blocked;
  const cors = corsHeadersFor(req);
  const requestStart = Date.now();
  // S9: resposta uniforme com tempo constante (800ms ± jitter 0-200ms)
  const MIN_RESPONSE_MS = 800 + Math.floor(Math.random() * 200);

  // Helper p/ uniformizar resposta + delay mínimo (anti-enumeration)
  const uniformOk = async () => {
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();
    const elapsed = Date.now() - requestStart;
    if (elapsed < MIN_RESPONSE_MS) await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
    return new Response(JSON.stringify({ success: true, expires_at: expiresAt }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  };

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      // S9: input inválido continua sendo 200 uniforme p/ não vazar
      return uniformOk();
    }

    const email = parsed.data.email.trim().toLowerCase();
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // S2 (rate-limit IP): 10 reqs/IP/hora — silenciosamente uniforme se exceder
    const ip = getClientIp(req);
    const ipHash = await hashIp(ip);
    const { data: rl } = await admin.rpc('check_and_increment_rate_limit', {
      _ip_hash: ipHash, _endpoint: 'send-otp-resend', _max: IP_RATE_MAX, _window_minutes: IP_RATE_WINDOW_MIN,
    });
    if (rl && (rl as any).allowed === false) {
      console.warn('send-otp-resend ip rate-limited', { email_masked: maskEmail(email) });
      return uniformOk();
    }

    // S8 (lockout): se bloqueado, devolve uniforme — mensagem idêntica
    const { data: locked } = await admin.rpc('is_email_locked', { _email: email });
    if (locked === true) {
      console.warn('send-otp-resend email locked', { email_masked: maskEmail(email) });
      return uniformOk();
    }

    // S25: se email não existe, devolve uniforme + sem enviar
    const exists = await emailExists(admin, email);
    if (!exists) {
      console.log('send-otp-resend: email not found, returning uniform success', { email_masked: maskEmail(email) });
      return uniformOk();
    }

    const code = generateCode();
    const codeHash = await sha256(`${email}:${code}`);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

    const { error: invalidateError } = await admin
      .from('otp_codes').update({ used: true })
      .eq('email', email).eq('used', false);
    if (invalidateError) {
      console.error('invalidate otp_codes error', invalidateError);
      return uniformOk();
    }

    const { error: insertError } = await admin.from('otp_codes').insert({
      email, code_hash: codeHash, expires_at: expiresAt, used: false, attempts: 0,
    });
    if (insertError) {
      console.error('insert otp_codes error', insertError);
      return uniformOk();
    }

    const ok = await sendResendEmail(email, `Seu código WnevesBox: ${code}`, emailHtml(code));
    if (!ok) {
      console.error('resend send failed', { email_masked: maskEmail(email) });
    } else {
      console.log('resend ok', { email_masked: maskEmail(email) });
    }
    return uniformOk();
  } catch (error) {
    console.error('send-otp-resend error', error);
    // S9: até erro inesperado é 200 uniforme p/ anti-enumeration
    return uniformOk();
  }
});

// Exportado p/ uso em verify-otp-resend (notificação de bloqueio)
export { lockoutEmailHtml, sendResendEmail };
