export interface DjenSyncResult {
  status: 'success' | 'partial' | 'failed';
  inserted?: number;
  total?: number;
  error?: string | null;
}

export function summarizeDjenSync(data: { success?: boolean; error?: string; results?: DjenSyncResult[] }) {
  if (!data.success || !data.results?.length) throw new Error(data.error || 'Busca não concluída ou nenhuma OAB ativa.');
  const failed = data.results.find(r => r.status !== 'success');
  if (failed) throw new Error(failed.error || 'Busca incompleta. Confira as intimações; ausência de novas publicações não foi confirmada.');
  return data.results.reduce((sum, r) => ({ inserted: sum.inserted + (r.inserted || 0), total: sum.total + (r.total || 0) }), { inserted: 0, total: 0 });
}