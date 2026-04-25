// Helper CORS compartilhado — allowlist estrita.
// S13: bloqueia origens desconhecidas (CSRF/abuse cross-origin via JS de site malicioso).
//
// Permitidas:
//   - https://wnevesbox.com               (domínio principal de produção)
//   - https://www.wnevesbox.com
//   - https://full-feature-replication.lovable.app  (publicado)
//   - https://*.lovable.app               (preview Lovable)
//   - https://*.lovable.dev
//   - http://localhost:* / http://127.0.0.1:*  (dev local)
//
// Para webhooks server-to-server (Resend, Lovable email-hook), o Origin não é enviado;
// nesse caso devolvemos um header neutro e o controle é feito por assinatura (já existe).

const ALLOWED_HOSTS = new Set([
  'wnevesbox.com',
  'www.wnevesbox.com',
  'full-feature-replication.lovable.app',
]);
const ALLOWED_HOST_SUFFIXES = ['.lovable.app', '.lovable.dev'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-lovable-signature, x-lovable-timestamp',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
};

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  const host = url.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  if (LOCAL_HOSTS.has(host)) return true;
  if (ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return true;
  return false;
}

/** Devolve o conjunto de headers CORS para a request atual. */
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  if (origin && isOriginAllowed(origin)) {
    return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin };
  }
  // Sem Origin (server-to-server) ou origem não permitida:
  // não setamos Allow-Origin → browser bloqueia, server-to-server segue funcionando.
  return { ...BASE_HEADERS };
}

/** Trata preflight OPTIONS. Retorna Response se for preflight, ou null. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  const origin = req.headers.get('origin');
  if (origin && !isOriginAllowed(origin)) {
    return new Response('forbidden_origin', { status: 403 });
  }
  return new Response('ok', { headers: corsHeadersFor(req) });
}

/** Para endpoints chamados pelo browser: rejeita Origin desconhecida com 403. */
export function rejectIfDisallowedOrigin(req: Request): Response | null {
  const origin = req.headers.get('origin');
  // Sem Origin = chamada server-to-server (curl, edge-to-edge, webhook). Permitir.
  if (!origin) return null;
  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'forbidden_origin' }), {
      status: 403,
      headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
    });
  }
  return null;
}
