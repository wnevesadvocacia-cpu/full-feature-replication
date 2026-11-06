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
