// Sincroniza intimações do DJEN (Diário de Justiça Eletrônico Nacional - CNJ)
// API pública gratuita: https://comunicaapi.pje.jus.br/api/v1/comunicacao
//
// SISTEMA À PROVA DE FALHAS — TOLERÂNCIA ZERO (perda = malpractice):
// 1. Retry com backoff exponencial (3 tentativas) por chamada à API CNJ
// 2. Timeout de 30s por requisição
// 3. Janela de busca redundante (45 dias) contra qualquer gap de cron
// 4. 3 crons concorrentes (6h, 1h safety, daily) — qualquer um cobre o outro se cair
// 5. Log persistente de cada execução (tabela sync_logs)
// 6. Falha em uma OAB NÃO interrompe sincronização das outras (Promise.allSettled)
// 7. Notificação destructive quando intimação tem prazo ≤ 5 dias úteis (CPC art. 219)
// 8. Alerta crítico ≥ 2 falhas consecutivas
// 9. external_id = SHA-256 determinístico → imune a mudança de formato da API
// 10. Batch lookup de processes (sem N+1) → escala com volume
// 11. Cálculo de prazo em DIAS ÚTEIS (calendário CNJ)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DjenItem {
  id?: number | string;
  hash?: string;
  numero_processo?: string;
  texto?: string;
  data_disponibilizacao?: string;
  siglaTribunal?: string;
  nomeOrgao?: string;
  tipoComunicacao?: string;
  prazo?: string;
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const DAYS_BACK = 45;
const PAGE_DELAY_MS = 250; // gap entre páginas para não estressar API CNJ

// ============= Calendário CNJ (dias úteis) =============
const FIXED_HOLIDAYS: Array<[number, number]> = [
  [1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25], [12, 8],
];

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUTC(d: Date, n: number): Date {
  const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x;
}

function fmtISO(d: Date): string { return d.toISOString().slice(0, 10); }

const holidayCache = new Map<number, Set<string>>();
function getHolidays(year: number): Set<string> {
  if (holidayCache.has(year)) return holidayCache.get(year)!;
  const set = new Set<string>();
  FIXED_HOLIDAYS.forEach(([m, d]) => set.add(fmtISO(new Date(Date.UTC(year, m - 1, d)))));
  const easter = easterSunday(year);
  set.add(fmtISO(addDaysUTC(easter, -48)));
  set.add(fmtISO(addDaysUTC(easter, -47)));
  set.add(fmtISO(addDaysUTC(easter, -2)));
  set.add(fmtISO(addDaysUTC(easter, 60)));
  holidayCache.set(year, set);
  return set;
}

function inRecesso(iso: string): boolean {
  const [, mm, dd] = iso.split('-').map(Number);
  if (mm === 12 && dd >= 20) return true;
  if (mm === 1 && dd <= 20) return true;
  return false;
}

function isBusinessDay(iso: string): boolean {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (inRecesso(iso)) return false;
  if (getHolidays(d.getUTCFullYear()).has(iso)) return false;
  return true;
}

function addBusinessDays(startIso: string, days: number): string {
  let d = new Date(startIso + 'T12:00:00Z');
  let added = 0;
  while (added < days) {
    d = addDaysUTC(d, 1);
    if (isBusinessDay(fmtISO(d))) added++;
  }
  return fmtISO(d);
}

function businessDaysUntil(targetIso: string): number {
  const today = fmtISO(new Date());
  if (targetIso <= today) return 0;
  let count = 0;
  let d = new Date(today + 'T12:00:00Z');
  const target = new Date(targetIso + 'T12:00:00Z').getTime();
  while (d.getTime() < target) {
    d = addDaysUTC(d, 1);
    if (isBusinessDay(fmtISO(d))) count++;
  }
  return count;
}

// ============= Hash determinístico (imune a mudança de formato) =============
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function buildExternalId(it: DjenItem): Promise<string> {
  // Camada 1: hash oficial da CNJ se existir
  if (it.hash) return `djen:hash:${it.hash}`;
  // Camada 2: id oficial
  if (it.id) return `djen:id:${it.id}`;
  // Camada 3: hash SHA-256 do conteúdo canônico (proc + data + texto trim)
  const canonical = [
    it.numero_processo || '',
    it.data_disponibilizacao || '',
    (it.texto || it.tipoComunicacao || '').slice(0, 2000).trim(),
    it.siglaTribunal || '',
    it.nomeOrgao || '',
  ].join('|');
  const h = await sha256Hex(canonical);
  return `djen:sha:${h}`;
}

// ============= Fetch com retry =============
async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(timer);
    if ((res.status >= 500 || res.status === 429) && attempt < MAX_RETRIES) {
      const wait = 2 ** attempt * 1000 + Math.random() * 500;
      console.warn(`DJEN ${res.status} — tentativa ${attempt}/${MAX_RETRIES}, aguardando ${Math.round(wait)}ms`);
      await new Promise(r => setTimeout(r, wait));
      return fetchWithRetry(url, attempt + 1);
    }
    return res;
  } catch (e: any) {
    clearTimeout(timer);
    if (attempt < MAX_RETRIES) {
      const wait = 2 ** attempt * 1000 + Math.random() * 500;
      console.warn(`DJEN fetch erro (${e.message}) — tentativa ${attempt}/${MAX_RETRIES}`);
      await new Promise(r => setTimeout(r, wait));
      return fetchWithRetry(url, attempt + 1);
    }
    throw e;
  }
}

async function fetchDjen(oab: string, uf: string): Promise<{ items: DjenItem[]; attempts: number }> {
  const dataInicio = new Date(Date.now() - DAYS_BACK * 86400_000).toISOString().slice(0, 10);
  const dataFim = new Date().toISOString().slice(0, 10);
  const all: DjenItem[] = [];
  let pagina = 1;
  let totalAttempts = 0;
  while (pagina <= 20) {
    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${encodeURIComponent(oab)}&ufOab=${encodeURIComponent(uf)}&dataDisponibilizacaoInicio=${dataInicio}&dataDisponibilizacaoFim=${dataFim}&pagina=${pagina}&itensPorPagina=100`;
    const res = await fetchWithRetry(url);
    totalAttempts++;
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`DJEN ${res.status} (pag ${pagina}): ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const items: DjenItem[] = json.items || json.data || [];
    if (!items.length) break;
    all.push(...items);
    if (items.length < 100) break;
    pagina++;
    await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }
  return { items: all, attempts: totalAttempts };
}

function cleanHtml(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractDeadline(text: string, receivedAt: string): string | null {
  const match = text.match(/prazo[\s\S]{0,40}?(\d{1,3})(?:\s*\([^)]+\))?\s*dias/i);
  if (!match) return null;
  const days = parseInt(match[1], 10);
  if (!days || days > 365) return null;
  // CPC art. 219: prazos processuais em DIAS ÚTEIS
  return addBusinessDays(receivedAt, days);
}

// ============= Batch lookup (elimina N+1) =============
async function buildProcessIndex(supabase: any, userId: string, numeros: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(numeros.filter(Boolean))];
  if (!unique.length) return map;
  // Postgres aceita IN com lotes grandes; quebrando em 500 por segurança
  const BATCH = 500;
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const { data } = await supabase.from('processes').select('id, number').eq('user_id', userId).in('number', chunk);
    (data || []).forEach((p: any) => map.set(p.number, p.id));
  }
  return map;
}

async function syncForOab(supabase: any, row: any, triggeredBy: string) {
  const startedAt = Date.now();
  let items: DjenItem[] = [];
  let attempts = 0;
  let inserted = 0;
  let urgentDeadlines = 0;
  let errorMessage: string | null = null;
  let status: 'success' | 'partial' | 'failed' = 'success';

  try {
    const result = await fetchDjen(row.oab_number, row.oab_uf);
    items = result.items;
    attempts = result.attempts;
  } catch (e: any) {
    errorMessage = e.message || String(e);
    status = 'failed';
  }

  if (status !== 'failed' && items.length > 0) {
    // Batch lookup de processes
    const numeros = items.map(it => it.numero_processo || '').filter(Boolean);
    const processIndex = await buildProcessIndex(supabase, row.user_id, numeros);

    for (const it of items) {
      try {
        const externalId = await buildExternalId(it);
        const cleanText = cleanHtml(it.texto || it.tipoComunicacao || 'Sem conteúdo');
        const receivedAt = it.data_disponibilizacao || new Date().toISOString().slice(0, 10);
        const deadline = extractDeadline(cleanText, receivedAt);
        const processId = it.numero_processo ? processIndex.get(it.numero_processo) || null : null;

        const { error } = await supabase.from('intimations').insert({
          user_id: row.user_id,
          external_id: externalId,
          source: 'djen',
          court: it.siglaTribunal ? `${it.siglaTribunal}${it.nomeOrgao ? ' - ' + it.nomeOrgao : ''}` : it.nomeOrgao,
          content: cleanText,
          received_at: receivedAt,
          deadline,
          process_id: processId,
          status: 'pendente',
        });

        if (!error) {
          inserted++;
          // URGENTE se prazo ≤ 5 dias ÚTEIS (CPC)
          const isUrgent = deadline && businessDaysUntil(deadline) <= 5;
          if (isUrgent) urgentDeadlines++;
          await supabase.from('notifications').insert({
            user_id: row.user_id,
            title: isUrgent ? '⚠️ Intimação URGENTE' : 'Nova intimação DJEN',
            message: `OAB/${row.oab_uf} ${row.oab_number} — ${it.siglaTribunal || 'Tribunal'} - ${it.numero_processo || 'Processo'}${deadline ? ` (prazo: ${deadline})` : ''}`,
            type: isUrgent ? 'destructive' : 'warning',
            link: '/intimacoes',
          });
        } else if (error.code !== '23505') {
          console.error('insert intimation error:', error);
          status = 'partial';
        }
      } catch (itemErr: any) {
        console.error('item processing error:', itemErr);
        status = 'partial';
      }
    }
  }

  const duration = Date.now() - startedAt;
  const now = new Date().toISOString();

  if (status === 'failed') {
    await supabase.from('oab_settings').update({
      last_sync_at: now,
      consecutive_failures: (row.consecutive_failures || 0) + 1,
      last_error: errorMessage?.slice(0, 500),
    }).eq('id', row.id);

    const failureCount = (row.consecutive_failures || 0) + 1;
    if (failureCount >= 2) {
      await supabase.from('notifications').insert({
        user_id: row.user_id,
        title: '🚨 Falha crítica na sincronização DJEN',
        message: `OAB/${row.oab_uf} ${row.oab_number} falhou ${failureCount}x consecutivas. Verifique imediatamente em Configurações → Intimações. Erro: ${errorMessage?.slice(0, 100)}`,
        type: 'destructive',
        link: '/configuracoes',
      });
    }
  } else {
    await supabase.from('oab_settings').update({
      last_sync_at: now,
      last_success_at: now,
      consecutive_failures: 0,
      last_error: null,
    }).eq('id', row.id);
  }

  await supabase.from('sync_logs').insert({
    user_id: row.user_id,
    oab_settings_id: row.id,
    oab_number: row.oab_number,
    oab_uf: row.oab_uf,
    status,
    attempts,
    items_found: items.length,
    items_inserted: inserted,
    duration_ms: duration,
    error_message: errorMessage?.slice(0, 1000),
    triggered_by: triggeredBy,
  });

  return {
    user_id: row.user_id,
    oab: `${row.oab_number}/${row.oab_uf}`,
    status,
    total: items.length,
    inserted,
    urgent: urgentDeadlines,
    attempts,
    duration_ms: duration,
    error: errorMessage,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const url = new URL(req.url);
    const isManual = url.searchParams.get('manual') === '1';
    const authHeader = req.headers.get('Authorization');
    const triggeredBy = isManual ? 'manual' : 'cron';

    let targets: any[] = [];

    if (isManual && authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data } = await supabase.from('oab_settings').select('*').eq('user_id', userData.user.id).eq('active', true);
      targets = data || [];
    } else {
      const { data } = await supabase.from('oab_settings').select('*').eq('active', true);
      targets = data || [];
    }

    const CONCURRENCY = 5;
    const results: any[] = [];
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(batch.map(row => syncForOab(supabase, row, triggeredBy)));
      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
        else results.push({ status: 'failed', error: String(r.reason) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('sync-djen fatal:', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
