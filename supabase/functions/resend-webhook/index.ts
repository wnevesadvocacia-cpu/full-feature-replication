// D5.2 + D5.3 — Webhook do Resend para eventos bounce/complaint/delivered.
// Valida assinatura via Svix (padrão Resend) e atualiza public.suppressed_emails.
// Esta tabela é checada pelo process-email-queue ANTES de cada envio para
// evitar mandar para endereços que já hard-bounce / spam-complain.
//
// Setup no painel do Resend:
//   Webhooks → Add endpoint
//   URL: https://<project>.supabase.co/functions/v1/resend-webhook
//   Events: email.bounced, email.complained, email.delivered
//   Copiar Signing Secret → adicionar como secret RESEND_WEBHOOK_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { captureException } from '../_shared/sentry.ts';

const SVIX_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutos

// Verifica assinatura no padrão Svix (svix-id, svix-timestamp, svix-signature).
// signed_payload = `${id}.${timestamp}.${body}` (HMAC-SHA256 com secret).
async function verifySvixSignature(req: Request, body: string, secret: string): Promise<boolean> {
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Tolerância de timestamp (replay protection)
  const ts = parseInt(svixTimestamp, 10) * 1000;
  if (!ts || Math.abs(Date.now() - ts) > SVIX_TOLERANCE_MS) return false;

  const signedPayload = `${svixId}.${svixTimestamp}.${body}`;

  // Secret no formato "whsec_<base64>" → decodifica
  const cleanSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = Uint8Array.from(atob(cleanSecret), (c) => c.charCodeAt(0));
  } catch {
    // fallback: trata como utf-8 cru
    secretBytes = new TextEncoder().encode(cleanSecret);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // svix-signature pode vir como "v1,<b64> v1,<b64>" — testa cada
  const candidates = svixSignature.split(' ').map((s) => s.split(',')[1]).filter(Boolean);
  // constant-time compare por index
  let matched = false;
  for (const c of candidates) {
    if (c.length === expectedB64.length) {
      let diff = 0;
      for (let i = 0; i < c.length; i++) diff |= c.charCodeAt(i) ^ expectedB64.charCodeAt(i);
      if (diff === 0) matched = true;
    }
  }
  return matched;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405 });
  }

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured');
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.text();
  const valid = await verifySvixSignature(req, body, secret);
  if (!valid) {
    console.warn('[resend-webhook] invalid signature');
    return new Response(JSON.stringify({ error: 'invalid_signature' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: any;
  try { payload = JSON.parse(body); } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const eventType: string = payload.type ?? '';
    const data = payload.data ?? {};
    const recipient: string | undefined = Array.isArray(data.to) ? data.to[0] : data.to;
    const messageId: string | undefined = data.email_id ?? data.id;

    if (!recipient) {
      return new Response(JSON.stringify({ ok: true, ignored: 'no_recipient' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Eventos relevantes para suppression
    const SUPPRESS_EVENTS: Record<string, string> = {
      'email.bounced': 'bounce',
      'email.complained': 'complaint',
      'email.dropped': 'dropped',
    };

    if (SUPPRESS_EVENTS[eventType]) {
      // Para bounces, só hard bounce vira suppression permanente
      const isHardBounce = eventType === 'email.bounced'
        ? (data.bounce?.type === 'hard' || data.bounce_type === 'hard')
        : true;

      if (isHardBounce || eventType !== 'email.bounced') {
        // upsert manual: tabela não tem unique constraint em email, então check first
        const { data: existing } = await supabase
          .from('suppressed_emails')
          .select('id')
          .eq('email', recipient)
          .eq('reason', SUPPRESS_EVENTS[eventType])
          .maybeSingle();

        if (!existing) {
          await supabase.from('suppressed_emails').insert({
            email: recipient,
            reason: SUPPRESS_EVENTS[eventType],
            metadata: {
              event_type: eventType,
              message_id: messageId,
              bounce: data.bounce ?? null,
              received_at: new Date().toISOString(),
            },
          });
        }

        await supabase.from('email_send_log').insert({
          message_id: messageId ?? null,
          template_name: 'webhook',
          recipient_email: recipient,
          status: SUPPRESS_EVENTS[eventType] === 'bounce' ? 'bounced' : SUPPRESS_EVENTS[eventType],
          error_message: data.bounce?.message ?? null,
          metadata: { event_type: eventType, raw: data },
        });
      }
    } else if (eventType === 'email.delivered') {
      // Apenas log, sem suppression
      await supabase.from('email_send_log').insert({
        message_id: messageId ?? null,
        template_name: 'webhook',
        recipient_email: recipient,
        status: 'delivered',
      });
    }

    return new Response(JSON.stringify({ ok: true, event: eventType }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    await captureException(e, { fn: 'resend-webhook' });
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
