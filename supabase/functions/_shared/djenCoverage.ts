// A successful transport is not proof that a source completed its search.
export function readDjenPage(payload: unknown, page: number, maxPages: number) {
  if (!payload || typeof payload !== 'object') throw new Error('DJEN: resposta inválida.');
  const json = payload as Record<string, unknown>;
  const items = json.items ?? json.data;
  if (!Array.isArray(items)) throw new Error('DJEN: resposta sem lista de publicações.');
  if (json.status && json.status !== 'success') throw new Error('DJEN: resposta indica falha.');
  const total = Number(json.count ?? json.total);
  const more = Number.isFinite(total) ? page * 100 < total : items.length >= 100;
  if (!items.length && more) throw new Error('DJEN: página vazia com publicações ainda pendentes.');
  return { items, more, truncated: more && page >= maxPages };
}

export function assertTribunalHtml(html: string, source: 'TJSP' | 'TJMG') {
  const blocked = /access denied|access from your country|captcha|cloudfront|service unavailable|just a moment|internal server error/i;
  const recognized = source === 'TJSP'
    ? /dadosConsulta|fundocinza1|nenhum resultado|não foram encontrad/i
    : /expediente|di[áa]rio|<p\b/i;
  if (blocked.test(html) || !recognized.test(html)) {
    throw new Error(`${source}: resposta não reconhecida; conferência não concluída.`);
  }
}

export function recordCoverageIssue(issues: string[], message: string) {
  if (issues.length < 20 && !issues.includes(message)) issues.push(message);
}

// Connection-level refusals (reset/TLS EOF/refused/timeout) mean the source
// rejected our network origin, not that the search returned nothing.
export function isTransportBlock(message: string): boolean {
  return /connection reset|tls handshake|handshake eof|connection refused|broken pipe|os error 10[34]|aborted|timed? ?out/i.test(message);
}

// Stops hammering a source that is refusing connections: after `limit`
// consecutive transport failures, remaining queries are skipped and reported
// as one aggregated incomplete-coverage issue (never as an empty search).
export function createTransportBreaker(limit = 3) {
  let consecutive = 0;
  let lastError = '';
  return {
    get open() { return consecutive >= limit; },
    get lastError() { return lastError; },
    fail(message: string) {
      if (isTransportBlock(message)) { consecutive++; lastError = message; } else consecutive = 0;
    },
    ok() { consecutive = 0; },
  };
}

// Persisted TJSP eSAJ cadence. The eSAJ resets server connections when queried
// every cron cycle; a recent complete check on the same São Paulo day covers the
// redundant default window, and transport refusals back off exponentially. A
// skipped attempt during backoff is always reported as incomplete coverage.
export interface TjspGateState {
  tjsp_last_ok_at: string | null;
  tjsp_next_attempt_at: string | null;
  tjsp_block_streak: number | null;
}
export type TjspGate =
  | { run: true }
  | { run: false; reason: 'fresh'; lastOk: string }
  | { run: false; reason: 'cooldown'; until: string; lastOk: string | null };

export const TJSP_FRESH_MS = 3 * 3600_000;
const TJSP_BACKOFF_BASE_MS = 15 * 60_000;
const TJSP_BACKOFF_MAX_MS = 3 * 3600_000;
const spDay = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);

export function decideTjspGate(state: TjspGateState | null, nowMs: number, explicitWindow: boolean): TjspGate {
  const lastOk = state?.tjsp_last_ok_at ?? null;
  const next = state?.tjsp_next_attempt_at ? Date.parse(state.tjsp_next_attempt_at) : NaN;
  if (Number.isFinite(next) && nowMs < next) return { run: false, reason: 'cooldown', until: state!.tjsp_next_attempt_at!, lastOk };
  const okMs = lastOk ? Date.parse(lastOk) : NaN;
  if (!explicitWindow && Number.isFinite(okMs) && nowMs - okMs < TJSP_FRESH_MS && spDay(okMs) === spDay(nowMs)) {
    return { run: false, reason: 'fresh', lastOk: lastOk! };
  }
  return { run: true };
}

export function nextTjspState(state: TjspGateState | null, nowMs: number, outcome: 'ok' | 'blocked' | 'failed'): Partial<TjspGateState> {
  if (outcome === 'ok') return { tjsp_last_ok_at: new Date(nowMs).toISOString(), tjsp_next_attempt_at: null, tjsp_block_streak: 0 };
  if (outcome === 'failed') return {};
  const streak = (state?.tjsp_block_streak ?? 0) + 1;
  const delay = Math.min(TJSP_BACKOFF_BASE_MS * 2 ** (streak - 1), TJSP_BACKOFF_MAX_MS);
  return { tjsp_block_streak: streak, tjsp_next_attempt_at: new Date(nowMs + delay).toISOString() };
}
