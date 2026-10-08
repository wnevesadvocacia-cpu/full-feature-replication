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