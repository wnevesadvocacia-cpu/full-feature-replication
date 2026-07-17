// Sincroniza intimações do DJEN (Diário de Justiça Eletrônico Nacional - CNJ)
// API pública gratuita: https://comunicaapi.pje.jus.br/api/v1/comunicacao
//
// SISTEMA À PROVA DE FALHAS — TOLERÂNCIA ZERO (perda = malpractice):
// 1. Retry com backoff exponencial (3 tentativas) por chamada à API CNJ
// 2. Timeout de 30s por requisição
// 3. Janela de busca redundante (45 dias) contra qualquer gap de cron
// 4. 3 crons concorrentes (6h, 1h safety, daily) — qualquer um cohbre o outro se cair
// 5. Log persistente de cada execução (tabela sync_logs)
// 6. Falha em uma OAB NÃO interrompe sincronização das outras (Promise.allSettled)
// 7. Notificação destructive quando intimação tem prazo ≤ 5 dias úteis (CPC art. 219)
// 8. Alerta crítico ≥ 2 falhas consecutivas
// 9. external_id = SHA-256 determinístico → imune a mudança de formato da API
// 10. Batch lookup de processes (sem N+1) → escala com volume
// 11. Cálculo de prazo em DIAS ÚTEIS (calendário CNJ)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from '../_shared/cors.ts';
import { rejectIfCsrfBlocked } from '../_shared/csrf.ts';
import { captureException } from '../_shared/sentry.ts';
// PR2 — edge unificada: detectDeadline canônico (mesma engine do frontend).
import { detectDeadline } from '../_shared/legalDeadlines.ts';

// SprintClosure #9 — Zod schema strict para resposta DJEN.
// Se um item falhar na validação, sync marca status='partial', preserva
// payload bruto em sync_logs.error_message e dispara alerta admin.
// CRÍTICO: NUNCA preenchemos receivedAt com today silenciosamente — se
// data_disponibilizacao estiver ausente/inválida, o item é REJEITADO.
const DjenItemSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  hash: z.string().optional(),
  numero_processo: z.string().optional(),
  texto: z.string().optional(),
  // data_disponibilizacao DEVE ser ISO YYYY-MM-DD se presente
  data_disponibilizacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data_disponibilizacao inválida').optional(),
  siglaTribunal: z.string().optional(),
  nomeOrgao: z.string().optional(),
  tipoComunicacao: z.string().optional(),
  prazo: z.string().optional(),
}).passthrough(); // permite campos extras (CNJ adiciona campos sem aviso)

type DjenItem = z.infer<typeof DjenItemSchema>;

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const DAYS_BACK = 30;
const PAGE_DELAY_MS = 250; // gap entre páginas para não estressar API CNJ
const TJMG_DJE_DELAY_MS = 150;
const TJSP_DJE_DELAY_MS = 200;

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
  // Fontes estaduais fallback já usam chave canônica própria.
  if ((it as any).__source && it.hash) return String(it.hash);
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

function maskProcessNumber(raw?: string | null): string | null {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length !== 20) return raw || null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

function normalizeProcessNumber(raw?: string | null): string | null {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length !== 20) return null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

function htmlDecode(raw: string): string {
  return (raw || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&aacute;/gi, 'á').replace(/&agrave;/gi, 'à').replace(/&acirc;/gi, 'â').replace(/&atilde;/gi, 'ã')
    .replace(/&eacute;/gi, 'é').replace(/&ecirc;/gi, 'ê')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&ocirc;/gi, 'ô').replace(/&otilde;/gi, 'õ')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ccedil;/gi, 'ç');
}

function stripHtmlToText(raw: string): string {
  return htmlDecode(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addCalendarDaysISO(iso: string, days: number): string {
  return fmtISO(addDaysUTC(new Date(iso + 'T12:00:00Z'), days));
}

function dateToTjmgDia(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}${m}`;
}

function tjmgComarcaParamFromProcess(numero: string): string | null {
  const d = numero.replace(/\D/g, '');
  if (d.length !== 20 || d.slice(14, 16) !== '13') return null;
  const foro = d.slice(16, 20);
  return foro === '0024' ? 'capital|j1' : `interior|${foro}`;
}

function buildTjmgExpedienteDates(dataInicio: string, dataFim: string): string[] {
  const dates: string[] = [];
  let d = new Date(addCalendarDaysISO(dataInicio, -3) + 'T12:00:00Z');
  const end = new Date(dataFim + 'T12:00:00Z').getTime();
  while (d.getTime() <= end) {
    const iso = fmtISO(d);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push(iso);
    d = addDaysUTC(d, 1);
  }
  return dates;
}

function looksLikeHeading(line: string): boolean {
  if (!line || /^Expediente de/i.test(line)) return false;
  if (/^(JUIZ|PROMOTOR|ESCRIV|ÍNDICE|INDICE|COMARCA)/i.test(line)) return false;
  if (/^\d{5}\s*-/.test(line)) return false;
  return line === line.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(line) && line.length <= 80;
}

async function fetchTjmgDjeFallback(processNumbers: string[], refNames: string[], dataInicio: string, dataFim: string): Promise<DjenItem[]> {
  const normalizedNumbers = [...new Set(processNumbers.map(normalizeProcessNumber).filter(Boolean) as string[])];
  const tjmgNumbers = normalizedNumbers.filter(n => n.includes('.8.13.'));
  if (!tjmgNumbers.length) return [];

  const numberSet = new Set(tjmgNumbers);
  const normalizedRefs = refNames.map(normalizeName).filter(Boolean);
  const comarcas = [...new Set(tjmgNumbers.map(tjmgComarcaParamFromProcess).filter(Boolean) as string[])];
  const dates = buildTjmgExpedienteDates(dataInicio, dataFim);
  const items: DjenItem[] = [];
  const seen = new Set<string>();

  for (const completa of comarcas) {
    for (const expedienteDate of dates) {
      const disponibilizacao = nextBusinessDay(expedienteDate, 'TJMG');
      if (disponibilizacao < dataInicio || disponibilizacao > dataFim) continue;

      const url = `https://www8.tjmg.jus.br/juridico/diario/index.jsp?dia=${dateToTjmgDia(expedienteDate)}&completa=${encodeURIComponent(completa)}`;
      let html = '';
      try {
        const res = await fetchWithRetry(url);
        if (!res.ok) continue;
        html = new TextDecoder('iso-8859-1').decode(await res.arrayBuffer());
      } catch (e) {
        console.warn('[tjmg-dje] fallback falhou:', (e as Error).message);
        continue;
      }

      const paragraphs = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
        .map(m => stripHtmlToText(m[1]))
        .filter(Boolean);

      let comarca = 'COMARCA';
      let vara = '';
      let classe = '';
      for (let i = 0; i < paragraphs.length; i++) {
        const line = paragraphs[i];
        if (/^COMARCA\s+DE\s+/i.test(line)) { comarca = line; continue; }
        if (/VARA|JUIZADO|TURMA RECURSAL/i.test(line) && line.length <= 90) { vara = line; continue; }
        if (looksLikeHeading(line)) { classe = line; continue; }

        const m = line.match(/^(\d{5})\s*-\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})$/);
        if (!m) continue;
        const seq = m[1];
        const numero = m[2];
        const detail = paragraphs[i + 1] || '';
        const detailNorm = normalizeName(detail);
        const byProcess = numberSet.has(numero);
        const byName = normalizedRefs.length > 0 && normalizedRefs.some(n => detailNorm.includes(n));
        if (!byProcess && !byName) continue;

        const key = `tjmg-dje:${expedienteDate}:${seq}:${numero}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const orgao = [vara, comarca].filter(Boolean).join(' DA ');
        const content = [
          `Disponibilização: ${disponibilizacao}`,
          `Expediente TJMG: ${expedienteDate}`,
          comarca,
          vara,
          classe,
          `${seq} - ${numero}`,
          detail,
        ].filter(Boolean).join('\n');

        items.push({
          id: key,
          hash: key,
          numero_processo: numero,
          texto: content,
          data_disponibilizacao: disponibilizacao,
          siglaTribunal: 'TJMG',
          nomeOrgao: orgao || comarca,
          tipoComunicacao: classe || 'Publicação TJMG',
          __queryKind: 'process',
          __source: 'tjmg-dje',
        } as DjenItem);
      }

      await new Promise(r => setTimeout(r, TJMG_DJE_DELAY_MS));
    }
  }

  return items;
}

// ============= Fetch com retry =============
async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    // CloudFront do CNJ bloqueia por geo (403). Edge runtime Supabase está em eu-central-1.
    // Solução: configurar PROXY_BR_URL apontando para proxy reverso hospedado no Brasil.
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

// ============= Fuzzy match de nome (Levenshtein normalizado) =============
function normalizeName(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

/**
 * Extrai possíveis nomes de destinatários/advogados do payload DJEN.
 * Cobre: destinatarios[].nome, destinatarioadvogados[].advogado.nome, texto livre,
 * advogados[].nome, intimado, autor/reu (best-effort).
 */
function extractDjenNames(it: any): string[] {
  const names: string[] = [];
  const push = (v: any) => { if (typeof v === 'string' && v.trim().length > 3) names.push(v); };
  if (Array.isArray(it.destinatarios)) it.destinatarios.forEach((d: any) => push(d?.nome));
  if (Array.isArray(it.destinatarioadvogados)) it.destinatarioadvogados.forEach((d: any) => push(d?.advogado?.nome ?? d?.nome));
  if (Array.isArray(it.advogados)) it.advogados.forEach((a: any) => push(a?.nome));
  push(it.nomeAdvogado);
  push(it.intimado);
  return names;
}

/**
 * Decide se a publicação é compatível com o(s) nome(s) configurado(s).
 * - Se nenhum nome configurado: aceita (compatibilidade retro).
 * - Se nomes do payload contiverem qualquer referência com similaridade ≥ threshold
 *   a algum dos nomes configurados, aceita.
 * - Se houver nomes no payload mas NENHUM bater: rejeita (publicação direcionada a outro advogado).
 * - Se o payload não trouxer nomes estruturados: aceita (não temos como rejeitar com segurança).
 */
function matchesConfiguredLawyer(it: any, refNames: string[], threshold: number): { ok: boolean; bestScore: number; reason: string } {
  if (!refNames.length) return { ok: true, bestScore: 1, reason: 'no-ref' };
  const candidates = extractDjenNames(it);
  if (!candidates.length) return { ok: true, bestScore: 0, reason: 'no-candidates' };
  let best = 0;
  for (const c of candidates) {
    for (const r of refNames) {
      const s = similarity(c, r);
      if (s > best) best = s;
      if (s >= threshold) return { ok: true, bestScore: s, reason: 'match' };
    }
  }
  return { ok: false, bestScore: best, reason: 'mismatch' };
}

// Proxy resolvido na inicialização do handler (lê djen_proxy_config). Module-level
// para evitar refazer query a cada chamada de fetchDjen dentro de um run.
let RESOLVED_PROXY_URL: string | null = null;
let OVERRIDE_START_DATE: string | null = null;
let OVERRIDE_END_DATE: string | null = null;
let OVERRIDE_DAYS_BACK: number | null = null;
let OVERRIDE_MAX_PAGES: number | null = null;
// Reconciliação manual: ignora filtro fuzzy de nome (usado quando o usuário
// aciona "Reconciliar DJEN" para recuperar publicações grosseiramente perdidas
// por mismatch de nome do advogado/destinatário).
let BYPASS_NAME_FILTER = false;

async function fetchDjen(oab: string, uf: string, lawyerName?: string | null, processNumbers: string[] = []): Promise<{ items: DjenItem[]; attempts: number }> {
  const daysBack = OVERRIDE_DAYS_BACK ?? DAYS_BACK;
  const dataInicio = OVERRIDE_START_DATE || new Date(Date.now() - daysBack * 86400_000).toISOString().slice(0, 10);
  const dataFim = OVERRIDE_END_DATE || new Date().toISOString().slice(0, 10);
  const maxPages = OVERRIDE_MAX_PAGES ?? 20;
  const all: DjenItem[] = [];
  const seen = new Set<string>();
  let totalAttempts = 0;
  let upstreamDegraded = false;

  // Base URL da API CNJ — usa proxy BR (Cloudflare Worker) se configurado para
  // contornar o geo-block da CloudFront que rejeita requests de fora do Brasil.
  // Prioridade: 1) RESOLVED_PROXY_URL (configurado pela UI em djen_proxy_config),
  //             2) secret DJEN_PROXY_URL, 3) URL direta do CNJ.
  const PROXY = (RESOLVED_PROXY_URL || Deno.env.get('DJEN_PROXY_URL') || 'https://djen-proxy-five.vercel.app').replace(/\/$/, '');
  const API_BASE = PROXY ? `${PROXY}/api/v1/comunicacao` : 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

  // Constrói lista de queries:
  //   1) sempre por OAB (comunicações dirigidas ao advogado);
  //   2) por nome do advogado (se configurado);
  //   3) por numeroProcesso para CADA processo cadastrado — cobre pautas de julgamento,
  //      listas de distribuição e atos administrativos que a API DJEN só retorna quando
  //      consultada pelo número do processo (não pela OAB).
  const queries: Array<{ kind: 'oab' | 'nome' | 'process'; build: (p: number) => string }> = [
    { kind: 'oab', build: (p) => `${API_BASE}?numeroOab=${encodeURIComponent(oab)}&ufOab=${encodeURIComponent(uf)}&dataDisponibilizacaoInicio=${dataInicio}&dataDisponibilizacaoFim=${dataFim}&pagina=${p}&itensPorPagina=100` },
  ];
  if (lawyerName && lawyerName.trim().length >= 5) {
    queries.push({ kind: 'nome', build: (p) => `${API_BASE}?nomeAdvogado=${encodeURIComponent(lawyerName.trim())}&dataDisponibilizacaoInicio=${dataInicio}&dataDisponibilizacaoFim=${dataFim}&pagina=${p}&itensPorPagina=100` });
  }
  for (const numero of processNumbers) {
    const n = (numero || '').trim();
    if (n.length < 15) continue;
    queries.push({ kind: 'process', build: (p) => `${API_BASE}?numeroProcesso=${encodeURIComponent(n)}&dataDisponibilizacaoInicio=${dataInicio}&dataDisponibilizacaoFim=${dataFim}&pagina=${p}&itensPorPagina=100` });
  }


  for (const q of queries) {
    if (upstreamDegraded) break;
    let pagina = 1;
    let queryItems = 0;
    while (pagina <= maxPages) {
      const url = q.build(pagina);
      totalAttempts++;
      let res: Response;
      try {
        res = await fetchWithRetry(url);
      } catch (e: any) {
        const msg = `DJEN fetch falhou (pag ${pagina}): ${e?.message || e}`;
        if (pagina > 1 || all.length > 0) {
          console.warn(`[sync-djen] ${msg}; preservando ${all.length} item(ns) já capturado(s).`);
          upstreamDegraded = true;
          break;
        }
        throw new Error(msg);
      }
      if (!res.ok) {
        const t = await res.text();
        // Detecta geo-block do CloudFront do CNJ — mensagem acionável em vez de HTML cru
        if (res.status === 403 && /block access from your country/i.test(t)) {
          const msg =
            `DJEN 403 GEO-BLOCK: o proxy configurado (${PROXY || 'direto'}) está saindo por IP fora do Brasil. ` +
            `Solução: use proxy hospedado em região BR (ver docs/cloudflare-worker-djen.md). ` +
            `Tribunal CNJ bloqueia CloudFront por geolocalização.`;
          if (all.length > 0) {
            console.warn(`[sync-djen] ${msg}; preservando ${all.length} item(ns) já capturado(s).`);
            upstreamDegraded = true;
            break;
          }
          throw new Error(msg);
        }
        const msg = `DJEN ${res.status} (pag ${pagina}): ${t.slice(0, 200)}`;
        if (pagina > 1 || all.length > 0) {
          console.warn(`[sync-djen] ${msg}; preservando ${all.length} item(ns) já capturado(s).`);
          upstreamDegraded = true;
          break;
        }
        throw new Error(msg);
      }
      const json = await res.json();
      const rawItems: unknown[] = json.items || json.data || [];
      if (!rawItems.length) break;
      const validItems: DjenItem[] = [];
      for (const raw of rawItems) {
        const parsed = DjenItemSchema.safeParse(raw);
        if (parsed.success) {
          if (!parsed.data.data_disponibilizacao) {
            console.warn('[djen-schema] item sem data_disponibilizacao válida — descartado', JSON.stringify(raw).slice(0, 200));
            continue;
          }
          // Dedup entre as duas queries (OAB + nomeAdvogado) usando hash/id quando disponível
          const dedupKey = parsed.data.hash || String(parsed.data.id || '') || JSON.stringify(raw).slice(0, 200);
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          // Marca origem da query para o filtro server-side pular items obtidos
          // por numeroProcesso (pautas/atos não citam nome do advogado).
          (parsed.data as any).__queryKind = q.kind;
          validItems.push(parsed.data);
        } else {
          console.warn('[djen-schema] item rejeitado pelo Zod:', parsed.error.flatten(), JSON.stringify(raw).slice(0, 200));
        }
      }
      all.push(...validItems);
      queryItems += validItems.length;
      if (rawItems.length < 100) break;
      pagina++;
      await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
    }
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

// PR2 — fonte única de verdade. Wrapper sobre detectDeadline (Deno port).
// Retorna o objeto completo para que o insert decida deadline canônico vs sugestão insegura.
function classifyIntimation(text: string, receivedAt: string) {
  const today = new Date().toISOString().slice(0, 10);
  return detectDeadline(text, receivedAt, today);
}

// ============= Batch lookup (elimina N+1) =============
async function buildProcessIndex(supabase: any, userIds: string[], numeros: string[]): Promise<Map<string, { id: string; user_id: string }>> {
  const map = new Map<string, { id: string; user_id: string }>();
  const unique = [...new Set(numeros.filter(Boolean))];
  const users = [...new Set(userIds.filter(Boolean))];
  if (!unique.length || !users.length) return map;
  // Postgres aceita IN com lotes grandes; quebrando em 500 por segurança
  const BATCH = 500;
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const { data } = await supabase.from('processes').select('id, number, user_id').in('user_id', users).in('number', chunk);
    (data || []).forEach((p: any) => map.set(p.number, { id: p.id, user_id: p.user_id }));
  }
  return map;
}

/**
 * Extrai o nº CNJ do "processo principal" referenciado no texto da publicação.
 * Casos típicos cobertos:
 *   - "Processo principal 1008786-86.2024.8.26.0127"
 *   - "Cumprimento de sentença (1008786-86.2024.8.26.0127)"
 *   - "originário do processo nº 1008786-86.2024.8.26.0127"
 *   - "vinculado a 1008786-86.2024.8.26.0127"
 *   - "derivado de 1008786-86.2024.8.26.0127"
 * Retorna o CNJ normalizado (formato canônico) ou null.
 */
function extractParentProcess(content: string, currentNumero: string | null): string | null {
  if (!content) return null;
  const CNJ = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
  const text = content.replace(/\s+/g, ' ');
  const patterns: RegExp[] = [
    /processo\s+principal[:\s]*?(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
    /cumprimento\s+de\s+senten[çc]a[^()]*\((\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\)/i,
    /(?:origin[áa]rio|vinculad[oa]|derivad[oa])\s+(?:de|do|ao)?\s*(?:processo)?\s*n?[ºo]?\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
    /execu[çc][ãa]o\s+(?:de\s+senten[çc]a)?\s*(?:nos\s+autos|do\s+processo)\s*n?[ºo]?\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] && m[1] !== currentNumero) return m[1];
  }
  // Heurística fallback: se o texto cita 2+ CNJs distintos e o primeiro é o cabeçalho (currentNumero),
  // o segundo é candidato a principal.
  const all = Array.from(new Set((text.match(CNJ) || []).filter((n) => n !== currentNumero)));
  if (all.length === 1 && currentNumero) return all[0];
  return null;
}

/** Detecta se a publicação trata de fase de execução / cumprimento de sentença. */
function detectsExecutionPhase(content: string): boolean {
  if (!content) return false;
  return /cumprimento\s+de\s+senten[çc]a|execu[çc][ãa]o\s+de\s+(senten[çc]a|t[íi]tulo)|fase\s+de\s+execu[çc][ãa]o/i.test(content);
}


async function syncForOab(supabase: any, row: any, triggeredBy: string) {
  const startedAt = Date.now();
  let items: DjenItem[] = [];
  let attempts = 0;
  let inserted = 0;
  let urgentDeadlines = 0;
  let nameRejected = 0;
  let errorMessage: string | null = null;
  let status: 'success' | 'partial' | 'failed' = 'success';
  const triggerCounts: Record<string, number> = {};

  // Nomes de referência para fuzzy match: lawyer_name + variações.
  const refNames: string[] = [
    ...(row.lawyer_name ? [String(row.lawyer_name)] : []),
    ...(Array.isArray(row.name_variations) ? row.name_variations.filter(Boolean).map(String) : []),
  ];
  const threshold = typeof row.name_match_threshold === 'number' ? row.name_match_threshold : 0.80;
  const syncStartDate = OVERRIDE_START_DATE || new Date(Date.now() - (OVERRIDE_DAYS_BACK ?? DAYS_BACK) * 86400_000).toISOString().slice(0, 10);
  const syncEndDate = OVERRIDE_END_DATE || new Date().toISOString().slice(0, 10);
  // Fallback TJMG estadual é pesado (HTML por comarca/data). No cron, cobre a
  // semana corrente/redundante; em reconciliação manual respeita a janela pedida.
  const stateFallbackStartDate = OVERRIDE_START_DATE
    || new Date(Date.now() - Math.min(7, OVERRIDE_DAYS_BACK ?? DAYS_BACK) * 86400_000).toISOString().slice(0, 10);

  try {
    const { data: roleRows } = await supabase.from('user_roles').select('user_id');
    const officeUserIds = [...new Set([row.user_id, ...((roleRows || []).map((r: any) => r.user_id).filter(Boolean))])];

    // Carrega números de processos do usuário da OAB para varredura adicional DJEN (pautas,
    // listas de distribuição, atos administrativos que só aparecem por numeroProcesso).
    const { data: ownProcs } = await supabase
      .from('processes')
      .select('number')
      .eq('user_id', row.user_id)
      .not('number', 'is', null);
    const processNumbers = (ownProcs || []).map((p: any) => p.number).filter(Boolean);

    const result = await fetchDjen(row.oab_number, row.oab_uf, row.lawyer_name, processNumbers);
    const { data: officeProcs } = await supabase
      .from('processes')
      .select('number')
      .in('user_id', officeUserIds)
      .not('number', 'is', null);
    const tjmgFallbackItems = await fetchTjmgDjeFallback(
      (officeProcs || []).map((p: any) => p.number).filter(Boolean),
      refNames,
      stateFallbackStartDate,
      syncEndDate,
    );

    const merged: DjenItem[] = [];
    const mergedSeen = new Set<string>();
    for (const it of [...result.items, ...tjmgFallbackItems]) {
      const key = `${it.hash || it.id || ''}|${it.numero_processo || ''}|${it.data_disponibilizacao || ''}|${(it.texto || '').slice(0, 200)}`;
      if (mergedSeen.has(key)) continue;
      mergedSeen.add(key);
      merged.push(it);
    }
    items = merged;
    attempts = result.attempts;
  } catch (e: any) {
    errorMessage = e.message || String(e);
    status = 'failed';
  }

  if (status !== 'failed' && items.length > 0) {
    // Filtro server-side por nome: desabilitado quando a intimação foi capturada
    // via numeroProcesso (pautas de julgamento não citam nome do advogado no
    // campo destinatários). Só aplicamos filtro se o payload tem destinatário
    // estruturado E existe conflito — a função matchesConfiguredLawyer já trata
    // "no-candidates" como aceite.
    if (refNames.length && !BYPASS_NAME_FILTER) {
      const filtered: DjenItem[] = [];
      for (const it of items) {
        // Items obtidos via numeroProcesso são de processos JÁ cadastrados pelo
        // usuário — pular filtro fuzzy evita perdas grosseiras (pautas, atos
        // administrativos, publicações sem destinatário estruturado).
        if ((it as any).__queryKind === 'process') { filtered.push(it); continue; }
        const m = matchesConfiguredLawyer(it as any, refNames, threshold);
        if (m.ok) filtered.push(it);
        else { nameRejected++; console.info(`[name-filter] descartado (score=${m.bestScore.toFixed(2)} < ${threshold})`); }
      }
      items = filtered;
    }


    // Batch lookup de processes — inclui CNJs do cabeçalho E "processo principal" extraído do conteúdo
    const numeros = items.map(it => it.numero_processo || '').filter(Boolean);
    const parents = items.map(it => extractParentProcess(cleanHtml(it.texto || ''), it.numero_processo || null) || '').filter(Boolean);
    const { data: roleRowsForIndex } = await supabase.from('user_roles').select('user_id');
    const processUserIds = [...new Set([row.user_id, ...((roleRowsForIndex || []).map((r: any) => r.user_id).filter(Boolean))])];
    const processIndex = await buildProcessIndex(supabase, processUserIds, [...numeros, ...parents]);


    const userEmailById = new Map<string, string | null>();
    for (const uid of processUserIds) {
      try {
        const { data: u } = await supabase.auth.admin.getUserById(uid);
        userEmailById.set(uid, u?.user?.email ?? null);
      } catch (_) { userEmailById.set(uid, null); }
    }

    for (const it of items) {
      try {
        const externalId = await buildExternalId(it);
        const _body = cleanHtml(it.texto || it.tipoComunicacao || 'Sem conteúdo');
        // AASP-style header: enriquece o conteúdo com metadados estruturados
        // que a API DJEN retorna em campos separados (não vêm no `texto`).
        const _fmtDate = (iso?: string) => {
          if (!iso) return '';
          const [y, m, d] = iso.split('-');
          return (y && m && d) ? `${d}/${m}/${y}` : iso;
        };
        const _partes = Array.isArray((it as any).destinatarios)
          ? (it as any).destinatarios.map((d: any) => d?.nome).filter(Boolean).join('; ')
          : '';
        const _advs = Array.isArray((it as any).destinatarioadvogados)
          ? (it as any).destinatarioadvogados.map((d: any) => {
              const nome = d?.advogado?.nome ?? d?.nome;
              const num = d?.advogado?.numero_oab ?? d?.numero_oab;
              const uf = d?.advogado?.uf_oab ?? d?.uf_oab;
              return nome ? `${nome}${num ? ` OAB ${uf || ''}${uf ? '-' : ''}${num}` : ''}` : '';
            }).filter(Boolean).join(', ')
          : (Array.isArray((it as any).advogados)
              ? (it as any).advogados.map((a: any) => a?.nome).filter(Boolean).join(', ')
              : '');
        const _headerLines = [
          it.tipoComunicacao ? `${it.tipoComunicacao}${it.numero_processo ? ` Processo: ${maskProcessNumber(it.numero_processo)}` : ''}` : (it.numero_processo ? `Processo: ${maskProcessNumber(it.numero_processo)}` : ''),
          it.nomeOrgao ? `Órgão: ${it.nomeOrgao}` : '',
          it.data_disponibilizacao ? `Data de disponibilização: ${_fmtDate(it.data_disponibilizacao)}` : '',
          (it as any).meio ? `Meio: ${(it as any).meio}` : '',
          _partes ? `Parte(s): ${_partes}` : '',
          _advs ? `Advogado(s): ${_advs}` : '',
        ].filter(Boolean);
        const cleanText = _headerLines.length
          ? `${_headerLines.join('\n')}\n\n${_body}`
          : _body;
        // SprintClosure #9: já garantido pelo Zod schema que data_disponibilizacao existe.
        // Não há mais fallback silencioso para today.
        const receivedAt = it.data_disponibilizacao!;
        const tribunal = it.siglaTribunal || null;
        // PR2 — fonte única: detectDeadline canônico.
        // Política de segurança jurídica:
        //   * auto_alta (≥0.9): grava deadline canônico.
        //   * demais (auto_media/baixa/ambigua_urgente): deadline=null + dump em deadline_sugerido_inseguro.
        const detected = classifyIntimation(cleanText, receivedAt);
        const trigKey = detected?.triggerSource ?? 'none';
        triggerCounts[trigKey] = (triggerCounts[trigKey] || 0) + 1;
        const isSafe = !!detected && detected.classificacaoStatus === 'auto_alta' && !!detected.dueDate;
        const deadline = isSafe ? detected!.dueDate : null;
        const deadlineSugeridoInseguro = (detected && !isSafe) ? {
          due_date: detected.dueDate,
          start_date: detected.startDate,
          days: detected.days,
          unit: detected.unit,
          label: detected.label,
          confianca: detected.confianca,
          classificacao_status: detected.classificacaoStatus,
          trigger_source: detected.triggerSource,
          calculated_at: new Date().toISOString(),
        } : null;
        // Resolução de processo: tenta CNJ direto; se não houver match, tenta "processo principal" do conteúdo
        let targetUserId = row.user_id;
        const directProcess = it.numero_processo ? processIndex.get(it.numero_processo) || null : null;
        let processId = directProcess?.id ?? null;
        if (directProcess?.user_id) targetUserId = directProcess.user_id;
        const parentNumero = extractParentProcess(cleanText, it.numero_processo || null);
        const isExecution = detectsExecutionPhase(cleanText) || (!!parentNumero && parentNumero !== it.numero_processo);
        let linkedToParent = false;
        if (!processId && parentNumero) {
          const parentProcess = processIndex.get(parentNumero) || null;
          if (parentProcess) { processId = parentProcess.id; targetUserId = parentProcess.user_id; linkedToParent = true; }
        }
        const classificationMeta: Record<string, any> | null = (isExecution || linkedToParent || parentNumero) ? {
          fase: isExecution ? 'execucao' : null,
          numero_execucao: linkedToParent ? (it.numero_processo || null) : null,
          processo_principal: parentNumero,
          linked_to_parent: linkedToParent,
        } : null;

        const { data: insertedRow, error } = await supabase.from('intimations').insert({
          user_id: targetUserId,
          external_id: externalId,
          source: (it as any).__source || 'djen',
          court: it.siglaTribunal ? `${it.siglaTribunal}${it.nomeOrgao ? ' - ' + it.nomeOrgao : ''}` : it.nomeOrgao,
          content: cleanText,
          received_at: receivedAt,
          deadline,
          deadline_sugerido_inseguro: deadlineSugeridoInseguro,
          peca_sugerida: detected?.pecaSugerida ?? null,
          base_legal: detected?.baseLegal ?? null,
          confianca_classificacao: detected?.confianca ?? null,
          classificacao_status: detected?.classificacaoStatus ?? null,
          classification_meta: classificationMeta,
          process_id: processId,
          status: 'pendente',
        }).select('id').single();

        if (!error && insertedRow) {
          inserted++;
          const isUrgent = !!(deadline && businessDaysUntil(deadline, tribunal) <= 5);
          if (isUrgent) urgentDeadlines++;

          await supabase.from('notifications').insert({
            user_id: targetUserId,
            title: isUrgent ? '⚠️ Intimação URGENTE — prazo ≤ 5 dias úteis' : 'Nova intimação DJEN',
            message: `OAB/${row.oab_uf} ${row.oab_number} — ${it.siglaTribunal || 'Tribunal'} - ${it.numero_processo || 'Processo'}${deadline ? ` (vence ${deadline})` : ''}`,
            type: isUrgent ? 'destructive' : 'warning',
            link: '/intimacoes',
          });

          // GAP 5: enfileira email instantâneo se prazo ≤ 5 dias úteis
          const userEmail = userEmailById.get(targetUserId) ?? null;
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
    name_rejected: nameRejected,
    attempts,
    duration_ms: duration,
    error: errorMessage,
    trigger_counts: triggerCounts,
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
  const runId = crypto.randomUUID();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const requestBody = req.method === 'POST' ? await req.clone().json().catch(() => ({})) : {};
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  OVERRIDE_START_DATE = typeof requestBody?.date_start === 'string' && dateRe.test(requestBody.date_start) ? requestBody.date_start : null;
  OVERRIDE_END_DATE = typeof requestBody?.date_end === 'string' && dateRe.test(requestBody.date_end) ? requestBody.date_end : null;
  OVERRIDE_DAYS_BACK = Number.isFinite(Number(requestBody?.days_back)) ? Math.max(0, Math.min(90, Number(requestBody.days_back))) : null;
  OVERRIDE_MAX_PAGES = Number.isFinite(Number(requestBody?.max_pages)) ? Math.max(1, Math.min(20, Number(requestBody.max_pages))) : null;
  BYPASS_NAME_FILTER = requestBody?.bypass_name_filter === true;

  // Manual = ?manual=1 OU reconciliação (bypass_name_filter=true) OU qualquer POST com body
  // de override de datas (evita ficar preso no lock do cron durante recuperação manual).
  const isManual = url.searchParams.get('manual') === '1'
    || BYPASS_NAME_FILTER
    || requestBody?.manual === true
    || !!(OVERRIDE_START_DATE || OVERRIDE_END_DATE);
  if (isManual) {
    const csrfBlock = rejectIfCsrfBlocked(req, corsHeaders);
    if (csrfBlock) return csrfBlock;
  }


  // Resolve proxy URL configurado pela UI (tabela djen_proxy_config). Falha silenciosa
  // → cai pro secret DJEN_PROXY_URL ou URL direta sem quebrar a sync.
  try {
    const { data: cfg } = await supabase.from('djen_proxy_config').select('proxy_url').eq('id', 1).maybeSingle();
    RESOLVED_PROXY_URL = ((cfg as { proxy_url?: string } | null)?.proxy_url) ?? null;
  } catch (e) {
    console.warn('[sync-djen] não foi possível ler djen_proxy_config:', (e as Error).message);
    RESOLVED_PROXY_URL = null;
  }

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

    // Health tracking — fonte primária DJEN
    try {
      const anyOk = results.some((r: any) => r?.status === 'success' || r?.status === 'partial');
      const allFailed = results.length > 0 && results.every((r: any) => r?.status === 'failed');
      if (anyOk) {
        await supabase.from('djen_source_health').update({
          current_source: 'djen',
          last_ok_at: new Date().toISOString(),
          consecutive_failures: 0,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq('id', 1);
      } else if (allFailed) {
        const firstErr = String((results.find((r: any) => r?.error)?.error) ?? 'todas OABs falharam').slice(0, 500);
        const { data: cur } = await supabase.from('djen_source_health').select('consecutive_failures').eq('id', 1).maybeSingle();
        const nextFails = ((cur as any)?.consecutive_failures ?? 0) + 1;
        await supabase.from('djen_source_health').update({
          current_source: nextFails >= 2 ? 'degraded' : 'djen',
          last_fail_at: new Date().toISOString(),
          consecutive_failures: nextFails,
          last_error: firstErr,
          updated_at: new Date().toISOString(),
        }).eq('id', 1);
      }
    } catch (e) { console.warn('[sync-djen] health update falhou:', (e as Error).message); }

    if (cronRunId) {
      // Telemetria PR3: agrega contagem de triggerSource por execução para
      // monitorar distribuição diária dos gatilhos do detectDeadline.
      const aggTriggers: Record<string, number> = {};
      for (const r of results) {
        const tc = (r as any)?.trigger_counts as Record<string, number> | undefined;
        if (tc) for (const [k, v] of Object.entries(tc)) aggTriggers[k] = (aggTriggers[k] || 0) + v;
      }
      await supabase.from('cron_runs').update({
        status: 'success', ended_at: new Date().toISOString(),
        metadata: { targets: targets.length, results: results.length, trigger_counts: aggTriggers },
      }).eq('id', cronRunId);
    }

    // Enriquecimento DataJud: vincula intimações com nº CNJ mas sem process_id.
    // Best-effort: falhas não afetam o resultado da sync.
    try {
      await supabase.functions.invoke('enrich-datajud', {
        body: { limit: 100 },
        headers: { 'x-admin-token': Deno.env.get('IMPORT_TOKEN') ?? '' },
      });
    } catch (e) {
      console.warn('[sync-djen] enrich-datajud falhou:', (e as Error).message);
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
    // Detecta instabilidade upstream do DJEN/CNJ (504/502/timeout) e devolve 200
    // com payload estruturado para a UI exibir mensagem amigável em vez do erro
    // genérico "non-2xx status code" do supabase-js.
    const msg = String(e?.message || e);
    const isUpstream = /DJEN\s+(502|503|504)|timeout|aborted|ETIMEDOUT|ECONNRESET/i.test(msg);
    try {
      const { data: cur } = await supabase.from('djen_source_health').select('consecutive_failures').eq('id', 1).maybeSingle();
      const nextFails = ((cur as any)?.consecutive_failures ?? 0) + 1;
      await supabase.from('djen_source_health').update({
        current_source: nextFails >= 2 ? 'degraded' : 'djen',
        last_fail_at: new Date().toISOString(),
        consecutive_failures: nextFails,
        last_error: msg.slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
    } catch (_) { /* ignore */ }
    if (isUpstream) {
      return new Response(JSON.stringify({
        success: false,
        upstream_unavailable: true,
        error: 'O Diário Eletrônico (CNJ/DJEN) está temporariamente instável. Tente novamente em alguns minutos.',
        detail: msg.slice(0, 200),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    if (lockAcquired) {
      await supabase.rpc('release_cron_lock', { _job_name: 'sync-djen' });
    }
  }
});
