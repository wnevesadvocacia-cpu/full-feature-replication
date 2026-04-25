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
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from '../_shared/cors.ts';
import { rejectIfCsrfBlocked } from '../_shared/csrf.ts';
import { captureException } from '../_shared/sentry.ts';

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

// GAP 2 + 3: cache em memória de suspensões + feriados de tribunal carregados do banco
let suspendedSet = new Set<string>();
const tribunalHolidaySets = new Map<string, Set<string>>();

async function loadLegalCalendar(supabase: any) {
  suspendedSet = new Set();
  tribunalHolidaySets.clear();
  const { data: sus } = await supabase.from('judicial_suspensions').select('start_date,end_date,tribunal_codigo');
  (sus || []).forEach((s: any) => {
    const start = new Date(s.start_date + 'T12:00:00Z');
    const end = new Date(s.end_date + 'T12:00:00Z');
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      // tribunal_codigo NULL => suspensão geral; específica vai no set do tribunal
      if (!s.tribunal_codigo) suspendedSet.add(fmtISO(d));
      else {
        const tset = tribunalHolidaySets.get(s.tribunal_codigo) ?? new Set<string>();
        tset.add(fmtISO(d));
        tribunalHolidaySets.set(s.tribunal_codigo, tset);
      }
    }
  });
  const { data: th } = await supabase.from('tribunal_holidays').select('tribunal_codigo,holiday_date');
  (th || []).forEach((h: any) => {
    const tset = tribunalHolidaySets.get(h.tribunal_codigo) ?? new Set<string>();
    tset.add(h.holiday_date);
    tribunalHolidaySets.set(h.tribunal_codigo, tset);
  });
}

function isBusinessDay(iso: string, tribunal?: string | null): boolean {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (inRecesso(iso)) return false;
  if (getHolidays(d.getUTCFullYear()).has(iso)) return false;
  if (suspendedSet.has(iso)) return false; // GAP 2
  if (tribunal) {
    const tset = tribunalHolidaySets.get(tribunal.toUpperCase());
    if (tset?.has(iso)) return false; // GAP 3
  }
  return true;
}

function nextBusinessDay(iso: string, tribunal?: string | null): string {
  let d = new Date(iso + 'T12:00:00Z');
  do { d = addDaysUTC(d, 1); } while (!isBusinessDay(fmtISO(d), tribunal));
  return fmtISO(d);
}

/** GAP 1 / CPC art. 224 §1º: prorroga p/ próximo dia útil se cair em data não-útil. */
function ensureBusinessDay(iso: string, tribunal?: string | null): string {
  return isBusinessDay(iso, tribunal) ? iso : nextBusinessDay(iso, tribunal);
}

function addBusinessDays(startIso: string, days: number, tribunal?: string | null): string {
  let d = new Date(startIso + 'T12:00:00Z');
  let added = 0;
  while (added < days) {
    d = addDaysUTC(d, 1);
    if (isBusinessDay(fmtISO(d), tribunal)) added++;
  }
  return ensureBusinessDay(fmtISO(d), tribunal); // GAP 1: prorrogação final
}

function businessDaysUntil(targetIso: string, tribunal?: string | null): number {
  const today = fmtISO(new Date());
  if (targetIso <= today) return 0;
  let count = 0;
  let d = new Date(today + 'T12:00:00Z');
  const target = new Date(targetIso + 'T12:00:00Z').getTime();
  while (d.getTime() < target) {
    d = addDaysUTC(d, 1);
    if (isBusinessDay(fmtISO(d), tribunal)) count++;
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

function extractDeadline(text: string, receivedAt: string, tribunal?: string | null): string | null {
  const match = text.match(/prazo[\s\S]{0,40}?(\d{1,3})(?:\s*\([^)]+\))?\s*dias/i);
  if (!match) return null;
  const days = parseInt(match[1], 10);
  if (!days || days > 365) return null;
  // CPC art. 224 §3º: publicação = 1º dia útil após disponibilização
  // CPC art. 224 §1º: prazo só inicia em dia útil; vencimento em não-útil prorroga
  const publicacao = nextBusinessDay(receivedAt, tribunal);
  return addBusinessDays(publicacao, days, tribunal);
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

    // GAP 5: pega email do usuário UMA vez para enfileirar alertas urgentes
    let userEmail: string | null = null;
    try {
      const { data: u } = await supabase.auth.admin.getUserById(row.user_id);
      userEmail = u?.user?.email ?? null;
    } catch (_) { /* segue sem email */ }

    for (const it of items) {
      try {
        const externalId = await buildExternalId(it);
        const cleanText = cleanHtml(it.texto || it.tipoComunicacao || 'Sem conteúdo');
        const receivedAt = it.data_disponibilizacao || new Date().toISOString().slice(0, 10);
        const tribunal = it.siglaTribunal || null;
        const deadline = extractDeadline(cleanText, receivedAt, tribunal);
        const processId = it.numero_processo ? processIndex.get(it.numero_processo) || null : null;

        const { data: insertedRow, error } = await supabase.from('intimations').insert({
          user_id: row.user_id,
          external_id: externalId,
          source: 'djen',
          court: it.siglaTribunal ? `${it.siglaTribunal}${it.nomeOrgao ? ' - ' + it.nomeOrgao : ''}` : it.nomeOrgao,
          content: cleanText,
          received_at: receivedAt,
          deadline,
          process_id: processId,
          status: 'pendente',
        }).select('id').single();

        if (!error && insertedRow) {
          inserted++;
          const isUrgent = !!(deadline && businessDaysUntil(deadline, tribunal) <= 5);
          if (isUrgent) urgentDeadlines++;

          await supabase.from('notifications').insert({
            user_id: row.user_id,
            title: isUrgent ? '⚠️ Intimação URGENTE — prazo ≤ 5 dias úteis' : 'Nova intimação DJEN',
            message: `OAB/${row.oab_uf} ${row.oab_number} — ${it.siglaTribunal || 'Tribunal'} - ${it.numero_processo || 'Processo'}${deadline ? ` (vence ${deadline})` : ''}`,
            type: isUrgent ? 'destructive' : 'warning',
            link: '/intimacoes',
          });

          // GAP 5: enfileira email instantâneo se prazo ≤ 5 dias úteis
          if (isUrgent && userEmail && deadline) {
            const diasUteis = businessDaysUntil(deadline, tribunal);
            const subject = `🚨 PRAZO CRÍTICO: ${diasUteis} dia(s) útil(eis) — vence ${deadline}`;
            const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;color:#111;padding:24px">
<div style="max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:#dc2626;color:#fff;padding:14px 20px;font-weight:bold;font-size:16px">⚠️ Prazo processual crítico</div>
  <div style="padding:20px">
    <p style="margin:0 0 12px"><strong>Tribunal:</strong> ${it.siglaTribunal || '—'}</p>
    <p style="margin:0 0 12px"><strong>Processo:</strong> ${it.numero_processo || '—'}</p>
    <p style="margin:0 0 12px"><strong>Vencimento:</strong> ${deadline} (${diasUteis} dia(s) útil(eis) restante(s))</p>
    <p style="margin:0 0 12px"><strong>OAB:</strong> ${row.oab_number}/${row.oab_uf}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
    <p style="margin:0 0 12px;font-size:13px;color:#374151">Conteúdo:</p>
    <p style="margin:0;font-size:13px;color:#111;white-space:pre-wrap">${cleanText.slice(0,1500).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'} as any)[c])}</p>
    <p style="margin:24px 0 0;font-size:12px;color:#6b7280">Acesse o sistema para tratar esta intimação.</p>
  </div>
</div></body></html>`;
            const messageId = `djen-urgent-${insertedRow.id}`;
            try {
              await supabase.rpc('enqueue_email', {
                queue_name: 'transactional_emails',
                payload: {
                  to: userEmail,
                  subject,
                  html,
                  label: 'prazo-critico-djen',
                  purpose: 'transactional',
                  message_id: messageId,
                  idempotency_key: messageId,
                  queued_at: new Date().toISOString(),
                },
              });
            } catch (mailErr) {
              console.error('enqueue urgent email failed:', mailErr);
            }
          }
        } else if (error && error.code !== '23505') {
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
  const corsPreflight = handleCorsPreflight(req);
  if (corsPreflight) return corsPreflight;
  const reject = rejectIfDisallowedOrigin(req);
  if (reject) return reject;
  const corsHeaders = corsHeadersFor(req);

  // S12: CSRF check apenas para execuções manuais (browser).
  // Cron interno chama sem Origin/Referer e passa pelo helper.
  const url = new URL(req.url);
  const isManual = url.searchParams.get('manual') === '1';
  if (isManual) {
    const csrfBlock = rejectIfCsrfBlocked(req, corsHeaders);
    if (csrfBlock) return csrfBlock;
  }
  const runId = crypto.randomUUID();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let lockAcquired = false;
  let cronRunId: string | null = null;
  if (!isManual) {
    const { data: lockOk } = await supabase.rpc('try_acquire_cron_lock', { _job_name: 'sync-djen' });
    lockAcquired = lockOk === true;
    if (!lockAcquired) {
      console.warn('[sync-djen] outra execução em andamento — abortando este disparo');
      return new Response(JSON.stringify({ success: false, skipped: true, reason: 'another_run_in_progress' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: cronRow } = await supabase.from('cron_runs').insert({
      job_name: 'sync-djen', run_id: runId, status: 'running', triggered_by: 'cron',
    }).select('id').single();
    cronRunId = cronRow?.id ?? null;
  }

  try {
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

    await loadLegalCalendar(supabase);

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

    if (cronRunId) {
      await supabase.from('cron_runs').update({
        status: 'success', ended_at: new Date().toISOString(),
        metadata: { targets: targets.length, results: results.length },
      }).eq('id', cronRunId);
    }

    return new Response(JSON.stringify({ success: true, run_id: runId, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('sync-djen fatal:', e);
    await captureException(e, { fn: 'sync-djen', extra: { run_id: runId } });
    if (cronRunId) {
      await supabase.from('cron_runs').update({
        status: 'failed', ended_at: new Date().toISOString(), error_message: String(e?.message || e).slice(0, 1000),
      }).eq('id', cronRunId);
    }
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    if (lockAcquired) {
      await supabase.rpc('release_cron_lock', { _job_name: 'sync-djen' });
    }
  }
});
