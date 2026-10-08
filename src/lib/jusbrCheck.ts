export interface JusbrRow { cnj: string; date: string; court: string; occurrence?: string }

export function readJusbrRows(value: unknown): JusbrRow[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new Error('Linhas do portal inválidas; conferência incompleta.');
  const rows: JusbrRow[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object' || typeof row.cnj !== 'string' || !/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(row.cnj)
      || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || !Number.isFinite(Date.parse(`${row.date}T12:00:00Z`)) || new Date(`${row.date}T12:00:00Z`).toISOString().slice(0, 10) !== row.date
      || typeof row.court !== 'string' || row.court.length > 80) throw new Error('Metadados inválidos; confira o portal.');
    const date = Date.parse(`${row.date}T12:00:00Z`);
    if (date > Date.now() + 86400000 || date < Date.now() - 90 * 86400000) throw new Error('Período fora da janela de 90 dias; confira manualmente.');
    rows.push({ cnj: row.cnj, date: row.date, court: row.court });
  }
  return rows;
}

// A list row is not a publication identity: multiple acts may share CNJ/date.
// A match is only a possible correspondence, never proof of coverage.
export function unmatchedJusbrRows(rows: JusbrRow[], records: { user_id: string; content: string; received_at: string; court?: string | null }[], owner: string) {
  return rows.filter(row => !records.some(record => record.user_id === owner
    && record.received_at.slice(0, 10) === row.date
    && (record.content.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g) || []).some(cnj => cnj === row.cnj)
    && record.court?.trim().toUpperCase() === row.court.trim().toUpperCase()));
}