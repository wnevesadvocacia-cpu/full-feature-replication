import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { extractCnjs } from '@/lib/cnjRegex';
import { sistemaAsOf, type SistemaEvent } from '@/lib/cnjTribunal';

const normCourt = (c?: string | null) =>
  (c || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Detecta o sistema de tramitação a partir de TODAS as publicações, com precisão
 * temporal: vale o sistema vigente na data de referência (última migração
 * publicada até aquela data). Serve para qualquer tribunal brasileiro:
 * 1) por processo (CNJ); 2) por órgão julgador — avisos de migração são
 * publicados por unidade e valem para todos os processos daquela vara/foro.
 */
export function useSistemaByCnj() {
  const { data } = useQuery({
    queryKey: ['sistema-by-cnj'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('intimations')
        .select('content, court, received_at')
        .order('received_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      const rows = (data || []) as { content: string; court: string | null; received_at: string | null }[];

      const byCnj = new Map<string, SistemaEvent[]>();
      for (const row of rows) {
        const ev: SistemaEvent = { content: row.content, date: row.received_at };
        // Só o CNJ principal (primeiro do texto): processos citados (ex.: processo
        // principal) não herdam a migração publicada para o processo intimado.
        const [primary] = extractCnjs(row.content);
        if (!primary) continue;
        const key = primary.replace(/\D/g, '');
        byCnj.set(key, [...(byCnj.get(key) || []), ev]);
      }
      return { cnj: byCnj };
    },
  });

  /** asOf: data de referência (ISO). Sem data, usa o estado mais recente. */
  return (numero?: string | null, _court?: string | null, asOf?: string | null): string | null => {
    if (!data) return null;
    const digits = (numero || '').replace(/\D/g, '');
    const evs = (digits && data.cnj.get(digits)) || [];
    // Avisos de migração no Brasil são publicados POR PROCESSO ("o presente
    // processo passará a tramitar..."), não por unidade. Fallback por órgão
    // julgador causava contaminação entre processos da mesma vara.
    return evs.length ? sistemaAsOf(evs, asOf) : null;
  };
}
