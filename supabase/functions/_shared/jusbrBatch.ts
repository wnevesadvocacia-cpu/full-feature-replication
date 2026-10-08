export type Observation = { cnj: string; date: string; court: string; occurrence?: string };
export function validateObservations(value: unknown): Observation[] {
  if (!Array.isArray(value) || value.length > 100) throw Error('Limite de 100 observações por lote.');
  return value.map((row, index) => {
    if (!row || typeof row.cnj !== 'string' || !/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(row.cnj)
      || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || !Number.isFinite(Date.parse(`${row.date}T12:00:00Z`))
      || new Date(`${row.date}T12:00:00Z`).toISOString().slice(0, 10) !== row.date
      || Date.parse(`${row.date}T12:00:00Z`) < Date.now() - 90 * 86400000
      || Date.parse(`${row.date}T12:00:00Z`) > Date.now() + 86400000
      || typeof row.court !== 'string' || !row.court.trim() || row.court.length > 80) throw Error('Metadados inválidos ou fora da janela de 90 dias.');
    // Preserve every occurrence: CNJ/date/court do not identify an individual act.
    return { cnj: row.cnj, date: row.date, court: row.court.trim(), occurrence: String(index) };
  });
}
export function ownerMatches(batch: { user_id: string }, owner: string) { return batch.user_id === owner; }
export function targetedNumbers(rows: Observation[]) { return [...new Set(rows.map(row => row.cnj))]; }
export function validCoverage(value: unknown, rows: Observation[]) {
  const c = value as Record<string, unknown> | null;
  if (!c || !Number.isInteger(c.page) || Number(c.page) < 1 || Number(c.page) > 1000
    || typeof c.run !== 'string' || !/^[0-9a-f-]{36}$/i.test(c.run)
    || !['visible', 'page', 'empty', 'blocked'].includes(String(c.kind))) throw Error('Cobertura inválida.');
  if (!rows.length && c.kind !== 'empty' && c.kind !== 'blocked') throw Error('Vazio sem evidência explícita.');
  return { run: c.run, page: c.page, kind: c.kind, complete: false, reason: String(c.reason || 'Identidade integral dos atos não verificada.').slice(0, 400) };
}
