import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { extractCnjs } from '@/lib/cnjRegex';
import { sistemaFromContents } from '@/lib/cnjTribunal';

const normCourt = (c?: string | null) =>
  (c || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Detecta o sistema de tramitação a partir de TODAS as publicações:
 * 1) por processo (CNJ), 2) por órgão julgador — avisos de migração (ex.: e-SAJ → eproc)
 * são publicados por unidade e valem para todos os processos daquela vara/foro.
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
      const rows = (data || []) as { content: string; court: string | null }[];

      const byCnj = new Map<string, string[]>();
      const byCourt = new Map<string, string[]>();
      for (const row of rows) {
        for (const cnj of extractCnjs(row.content)) {
          const key = cnj.replace(/\D/g, '');
          byCnj.set(key, [...(byCnj.get(key) || []), row.content]);
        }
        const ck = normCourt(row.court);
        if (ck) byCourt.set(ck, [...(byCourt.get(ck) || []), row.content]);
      }

      const reduce = (m: Map<string, string[]>) => {
        const out = new Map<string, string>();
        m.forEach((contents, key) => {
          const s = sistemaFromContents(contents);
          if (s) out.set(key, s);
        });
        return out;
      };
      return { cnj: reduce(byCnj), court: reduce(byCourt) };
    },
  });

  return (numero?: string | null, court?: string | null): string | null => {
    if (!data) return null;
    const digits = (numero || '').replace(/\D/g, '');
    if (digits && data.cnj.has(digits)) return data.cnj.get(digits)!;
    const ck = normCourt(court);
    if (ck && data.court.has(ck)) return data.court.get(ck)!;
    return null;
  };
}
