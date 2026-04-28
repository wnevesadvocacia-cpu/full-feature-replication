// Configura e valida o proxy DJEN (Cloudflare Worker) via UI.
// Ações:
//   - GET  ?action=get          → retorna URL atual + status (admin only)
//   - POST { action:"validate", url } → testa proxy chamando endpoint real (admin)
//   - POST { action:"save", url }     → valida e persiste em djen_proxy_config (admin)
//   - POST { action:"clear" }         → remove URL (admin)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeadersFor, handleCorsPreflight } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}

function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim().replace(/\/+$/, ''));
    if (!/^https?:$/.test(u.protocol)) return null;
    // remove qualquer pathname/search — proxy é só o host
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

async function validateProxy(url: string): Promise<{ ok: boolean; status: number; sample?: string; error?: string; latencyMs: number }> {
  // Testa com um range pequeno (ontem) e itensPorPagina=1 — só quer saber se o
  // proxy entrega 200 com JSON válido do CNJ.
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const probe = `${url}/api/v1/comunicacao?numeroOab=290702&ufOab=SP&dataDisponibilizacaoInicio=${fmt(yesterday)}&dataDisponibilizacaoFim=${fmt(today)}&pagina=1&itensPorPagina=1`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  const t0 = Date.now();
  try {
    const r = await fetch(probe, { signal: ctrl.signal });
    const latencyMs = Date.now() - t0;
    const text = await r.text();
    if (r.status !== 200) {
      return { ok: false, status: r.status, error: `Proxy retornou HTTP ${r.status}: ${text.slice(0, 200)}`, latencyMs };
    }
    // Deve ser JSON válido com estrutura mínima
    let parsed: any;
    try { parsed = JSON.parse(text); } catch {
      return { ok: false, status: r.status, error: 'Resposta não é JSON válido — proxy provavelmente devolvendo HTML/erro', latencyMs };
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, status: r.status, error: 'JSON inesperado (não é objeto)', latencyMs };
    }
    // CNJ devolve { items: [...], count, ... } ou variação. Aceitamos qualquer objeto JSON.
    const sample = JSON.stringify(parsed).slice(0, 240);
    return { ok: true, status: r.status, sample, latencyMs };
  } catch (e: any) {
    const latencyMs = Date.now() - t0;
    if (e.name === 'AbortError') return { ok: false, status: 0, error: 'Timeout (15s) — proxy não respondeu', latencyMs };
    return { ok: false, status: 0, error: e?.message ?? String(e), latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const pre = handleCorsPreflight(req); if (pre) return pre;

  // Auth: precisa de JWT do usuário (admin)
  const authz = req.headers.get('authorization') ?? '';
  if (!authz.toLowerCase().startsWith('bearer ')) return json({ error: 'unauthorized' }, 401, origin);
  const userJwt = authz.slice(7);

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roleData } = await admin
    .from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
  if (!roleData) return json({ error: 'forbidden: admin only' }, 403, origin);

  let action = new URL(req.url).searchParams.get('action');
  let url: string | undefined;
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      action = body.action ?? action;
      url = body.url;
    } catch { /* ignore */ }
  }

  if (action === 'get') {
    const { data } = await admin.from('djen_proxy_config').select('*').eq('id', 1).maybeSingle();
    return json({ ok: true, config: data ?? null }, 200, origin);
  }

  if (action === 'validate' || action === 'save') {
    if (!url) return json({ error: 'missing url' }, 400, origin);
    const norm = normalizeUrl(url);
    if (!norm) return json({ error: 'URL inválida (use https://nome.workers.dev)' }, 400, origin);

    const result = await validateProxy(norm);
    if (action === 'validate') {
      return json({ ok: result.ok, normalized: norm, ...result }, 200, origin);
    }
    // save: só persiste se OK
    if (!result.ok) {
      return json({ ok: false, normalized: norm, ...result, error: `Validação falhou: ${result.error}` }, 400, origin);
    }
    const { error: upErr } = await admin.from('djen_proxy_config').update({
      proxy_url: norm,
      validated_at: new Date().toISOString(),
      validated_by: userData.user.id,
      last_status: 'ok',
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    if (upErr) return json({ ok: false, error: upErr.message }, 500, origin);
    await admin.from('audit_logs').insert({
      user_id: userData.user.id, user_email: userData.user.email,
      action: 'DJEN_PROXY_CONFIGURED', table_name: 'djen_proxy_config',
      new_data: { proxy_url: norm, latency_ms: result.latencyMs },
    });
    return json({ ok: true, normalized: norm, latencyMs: result.latencyMs }, 200, origin);
  }

  if (action === 'clear') {
    await admin.from('djen_proxy_config').update({
      proxy_url: null, validated_at: null, last_status: 'cleared', last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    await admin.from('audit_logs').insert({
      user_id: userData.user.id, user_email: userData.user.email,
      action: 'DJEN_PROXY_CLEARED', table_name: 'djen_proxy_config', new_data: {},
    });
    return json({ ok: true }, 200, origin);
  }

  return json({ error: 'unknown action' }, 400, origin);
});
