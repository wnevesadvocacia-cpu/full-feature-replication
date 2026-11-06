import { FunctionRegion } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { summarizeDjenSync } from './djenSyncResult';

export async function runDjenSync(body: Record<string, unknown> = {}) {
  // Região São Paulo: o eSAJ/TJSP recusa conexões vindas da região padrão do servidor.
  const { data: start, error } = await supabase.functions.invoke('sync-djen', { body: { ...body, manual: true }, method: 'POST', region: FunctionRegion.SaEast1 });
  if (error) throw error;
  if (!start?.background) return summarizeDjenSync(start || {});
  if (!start.run_id) throw new Error('Busca não iniciada.');
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const { data, error: statusError } = await supabase.functions.invoke(`sync-djen?run_id=${encodeURIComponent(start.run_id)}`, { method: 'GET' });
    if (statusError) throw statusError;
    if (data?.status === 'running') continue;
    return summarizeDjenSync(data || {});
  }
  throw new Error('Busca ainda sem conclusão confirmada. Não considere isso ausência de intimações; confira novamente em alguns minutos.');
}