// Sentry-stub local para edge functions.
// Substituível por @sentry/deno + DSN real no futuro sem mudar call-sites.
//
// Por enquanto: grava erros não-tratados em audit_logs com action='ERROR_EDGE'.
// Sem PII no payload (só nome do edge, mensagem, stack truncado, user_id se houver).
//
// USO:
//   import { captureException } from '../_shared/sentry.ts';
//   try { ... } catch (e) { await captureException(e, { fn: 'sync-djen', userId }); throw e; }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

interface CaptureContext {
  fn: string;                       // nome da edge function
  userId?: string | null;
  extra?: Record<string, unknown>;  // contexto sem PII (nº processo, OAB, etc — ok)
}

let _client: any = null;
function getClient() {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

function sanitize(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') {
    // remove e-mails, CPFs, números longos óbvios
    return v
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[cpf]')
      .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[cnpj]')
      .slice(0, 2000);
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 20).map(sanitize);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/email|password|token|secret|key|cpf|cnpj/i.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = sanitize(val);
      }
    }
    return out;
  }
  return String(v).slice(0, 500);
}

export async function captureException(error: unknown, ctx: CaptureContext): Promise<void> {
  try {
    const client = getClient();
    if (!client) {
      console.error('[sentry-stub] no client', { fn: ctx.fn, error: String(error) });
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error && error.stack ? error.stack.slice(0, 4000) : null;
    await client.from('audit_logs').insert({
      user_id: ctx.userId ?? null,
      action: 'ERROR_EDGE',
      table_name: `edge.${ctx.fn}`,
      new_data: {
        fn: ctx.fn,
        message: msg.slice(0, 1000),
        stack,
        extra: ctx.extra ? sanitize(ctx.extra) : null,
        captured_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    // Nunca deixar Sentry derrubar o handler real
    console.error('[sentry-stub] capture failed', e);
  }
}

export async function captureMessage(message: string, ctx: CaptureContext): Promise<void> {
  return captureException(new Error(message), ctx);
}
