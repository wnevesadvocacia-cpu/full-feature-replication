import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from '../_shared/cors.ts';
import { getClientIp, hashIp, maskEmail } from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SITE_NAME = 'WnevesBox';
const RESET_TTL_MINUTES = 60;
const RATE_MAX = 5;
const RATE_WINDOW_MIN = 60;

const BodySchema = z.object({
  email: z.string().trim().email(),
  redirect_to: z.string().trim().url().optional(),
});

function fromAddress() {
  const raw = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@notify.wnevesbox.com';
  const match = raw.match(/<([^>]+)>/);
  const addr = match ? match[1] : raw;
  return `${SITE_NAME} <${addr}>`;
}

function recoveryHtml(actionLink: string) {
  return `<!doctype html><html lang="pt-BR"><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#ffffff;margin:0;padding:32px;color:#0f172a;"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><tr><td style="padding:28px 32px;background:#0f172a;color:#ffffff;"><h1 style="margin:0;font-size:20px;font-weight:700;">WnevesBox</h1></td></tr><tr><td style="padding:32px;"><h2 style="margin:0 0 16px;font-size:22px;color:#0f172a;">Redefinir senha</h2><p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#334155;">Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha. O link expira em ${RESET_TTL_MINUTES} minutos.</p><p style="margin:28px 0;"><a href="${actionLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 20px;font-size:14px;font-weight:700;">Redefinir minha senha</a></p><p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#64748b;">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="${actionLink}" style="color:#2563eb;word-break:break-all;">${actionLink}</a></p><p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;">Se você não solicitou isso, ignore este e-mail.</p></td></tr></table></body></html>`;
}

async function sendResetEmail(to: string, actionLink: string) {
  if (!RESEND_API_KEY) throw new Error('missing_email_key');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject: 'WnevesBox — redefinição de senha',
      html: recoveryHtml(actionLink),
    }),
  });
  if (!response.ok) throw new Error(`email_send_failed_${response.status}`);
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const blocked = rejectIfDisallowedOrigin(req);
  if (blocked) return blocked;
  const cors = corsHeadersFor(req);
  const started = Date.now();

  const uniformOk = async () => {
    const elapsed = Date.now() - started;
    if (elapsed < 800) await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  };

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return uniformOk();

    const email = parsed.data.email.trim().toLowerCase();
    const redirectTo = parsed.data.redirect_to ?? 'https://wnevesbox.com/#/reset-password';
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const ipHash = await hashIp(getClientIp(req));
    const { data: rate } = await admin.rpc('check_and_increment_rate_limit', {
      _ip_hash: ipHash,
      _endpoint: 'request-password-reset',
      _max: RATE_MAX,
      _window_minutes: RATE_WINDOW_MIN,
    });
    if (rate && (rate as any).allowed === false) return uniformOk();

    const { data: exists } = await admin.rpc('auth_user_exists_by_email', { _email: email });
    if (exists !== true) return uniformOk();

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });
    if (error || !data?.properties?.action_link) {
      console.error('password reset link generation failed', { email_masked: maskEmail(email), error });
      return uniformOk();
    }

    await sendResetEmail(email, data.properties.action_link);
    console.log('password reset email sent', { email_masked: maskEmail(email) });
    return uniformOk();
  } catch (error) {
    console.error('request-password-reset error', error);
    return uniformOk();
  }
});