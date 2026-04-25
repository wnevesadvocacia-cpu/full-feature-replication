// Sentry-stub frontend. Captura erros não-tratados (window.onerror,
// unhandledrejection, ErrorBoundary) e envia via RPC log_auth_event como
// breadcrumb estruturado em audit_logs.
//
// Trocável por @sentry/react + DSN sem mudar call-sites.
// PII removida no client antes de enviar (sanitize()).

import { supabase } from '@/integrations/supabase/client';

interface ErrorContext {
  source: 'window' | 'unhandledrejection' | 'boundary' | 'manual';
  componentStack?: string;
  url?: string;
  extra?: Record<string, unknown>;
}

function sanitize(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') {
    return v
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[cpf]')
      .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[cnpj]')
      .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [redacted]')
      .slice(0, 2000);
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 20).map(sanitize);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/email|password|token|secret|key|cpf|cnpj|authorization/i.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = sanitize(val);
      }
    }
    return out;
  }
  return String(v).slice(0, 500);
}

// Throttle: 1 mesmo erro a cada 30s para evitar floods
const recentErrors = new Map<string, number>();
function shouldSend(key: string): boolean {
  const now = Date.now();
  const last = recentErrors.get(key) ?? 0;
  if (now - last < 30_000) return false;
  recentErrors.set(key, now);
  // GC: mantém só últimos 50
  if (recentErrors.size > 50) {
    const first = recentErrors.keys().next().value;
    if (first) recentErrors.delete(first);
  }
  return true;
}

export async function captureException(error: unknown, ctx: ErrorContext = { source: 'manual' }): Promise<void> {
  try {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error && error.stack ? error.stack.slice(0, 4000) : null;
    const key = `${ctx.source}:${msg.slice(0, 100)}`;
    if (!shouldSend(key)) return;

    const payload = {
      source: ctx.source,
      message: sanitize(msg) as string,
      stack: stack ? (sanitize(stack) as string) : null,
      url: ctx.url ?? (typeof window !== 'undefined' ? window.location.pathname : ''),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
      component_stack: ctx.componentStack?.slice(0, 2000),
      extra: ctx.extra ? (sanitize(ctx.extra) as Record<string, unknown>) : undefined,
      captured_at: new Date().toISOString(),
    };

    // Usa log_auth_event (já existe e ignora silenciosamente quando não autenticado)
    await (supabase as any).rpc('log_auth_event', {
      _event: 'ERROR_FRONTEND',
      _metadata: payload,
    });
  } catch {
    // jamais deixar o stub derrubar a página
  }
}

let installed = false;
export function installGlobalHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    captureException(event.error ?? event.message, {
      source: 'window',
      url: event.filename,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureException(event.reason, { source: 'unhandledrejection' });
  });
}
