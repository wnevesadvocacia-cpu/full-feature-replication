// djen-watchdog: 3 verificações diárias à prova de erro
// 1) OAB stale/inactive: alerta se OAB inativa ou last_sync_at > 24h
// 2) Heartbeat: notifica/loga "OK + N publicações últimas 24h" para cada usuário com OAB ativa
// 3) Reconciliação: consulta DJEN do dia D-1 por OAB e compara count(DJEN) vs count(intimations);
//    divergência → notificação destrutiva.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
};

const DJEN_URL = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const STALE_HOURS = 24;

function yesterdayISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function countDjen(oab: string, uf: string, dateISO: string): Promise<number | null> {
  const url = `${DJEN_URL}?numeroOab=${oab}&ufOab=${uf}&dataDisponibilizacaoInicio=${dateISO}&dataDisponibilizacaoFim=${dateISO}&itensPorPagina=1&pagina=1`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const j = await r.json();
    // API retorna campo "count" total quando paginado
    return typeof j?.count === 'number' ? j.count : (Array.isArray(j?.items) ? j.items.length : null);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Auth: cron OU admin token
  const adminToken = req.headers.get('x-admin-token');
  const expected = Deno.env.get('IMPORT_TOKEN');
  const authHeader = req.headers.get('authorization') ?? '';
  const isCron = authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '__none__');
  if (!isCron && (!adminToken || !expected || adminToken !== expected)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const report: any = { stale: [], heartbeat: [], reconciliation: [] };
  const now = Date.now();
  const staleMs = STALE_HOURS * 3600 * 1000;
  const since24h = new Date(now - 24 * 3600 * 1000).toISOString();
  const dateRecon = yesterdayISO();

  // Carrega TODAS as OABs (ativas + inativas) por usuário
  const { data: oabs } = await supabase
    .from('oab_settings')
    .select('id, user_id, oab_number, oab_uf, active, last_sync_at');

  for (const o of (oabs ?? [])) {
    const label = `${o.oab_uf} ${o.oab_number}`;

    // 1) Stale / inactive
    const last = o.last_sync_at ? new Date(o.last_sync_at).getTime() : 0;
    const ageH = last ? Math.round((now - last) / 3600_000) : null;
    if (!o.active) {
      await supabase.from('notifications').insert({
        user_id: o.user_id,
        title: '🚨 OAB INATIVA — sincronização parada',
        message: `OAB ${label} está inativa. Reative em Configurações → Intimações imediatamente.`,
        type: 'destructive',
        link: '/configuracoes',
      });
      report.stale.push({ oab: label, reason: 'inactive', user_id: o.user_id });
    } else if (!last || (now - last) > staleMs) {
      await supabase.from('notifications').insert({
        user_id: o.user_id,
        title: '⚠️ OAB sem sincronização há mais de 24h',
        message: `OAB ${label}: última sync há ${ageH ?? '∞'}h. Risco de perda de prazo.`,
        type: 'destructive',
        link: '/intimacoes',
      });
      report.stale.push({ oab: label, reason: 'stale', hours: ageH, user_id: o.user_id });
    }

    if (!o.active) continue;

    // 2) Heartbeat: count das últimas 24h
    const { count: hbCount } = await supabase
      .from('intimations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', o.user_id)
      .gte('created_at', since24h);

    await supabase.from('notifications').insert({
      user_id: o.user_id,
      title: '✅ Sync DJEN OK (24h)',
      message: `OAB ${label}: ${hbCount ?? 0} publicação(ões) capturadas nas últimas 24h.`,
      type: 'info',
      link: '/intimacoes',
    });
    report.heartbeat.push({ oab: label, last_24h: hbCount ?? 0 });

    // 3) Reconciliação D-1: DJEN vs banco
    const djenCount = await countDjen(o.oab_number, o.oab_uf, dateRecon);
    const { count: dbCount } = await supabase
      .from('intimations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', o.user_id)
      .eq('received_at', dateRecon);

    const reconItem: any = { oab: label, date: dateRecon, djen: djenCount, db: dbCount ?? 0 };
    if (djenCount !== null && djenCount > (dbCount ?? 0)) {
      await supabase.from('notifications').insert({
        user_id: o.user_id,
        title: '🚨 DIVERGÊNCIA DJEN vs Banco',
        message: `${dateRecon} · OAB ${label}: DJEN=${djenCount} · Banco=${dbCount ?? 0}. Faltam ${djenCount - (dbCount ?? 0)}. Execute Sincronizar.`,
        type: 'destructive',
        link: '/intimacoes',
      });
      reconItem.divergence = true;
    }
    report.reconciliation.push(reconItem);
  }

  return new Response(JSON.stringify({ ok: true, report, ran_at: new Date().toISOString() }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
