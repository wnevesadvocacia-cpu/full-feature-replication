import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { extractCnjs } from '@/lib/cnjRegex';
import { sistemaFromContents } from '@/lib/cnjTribunal';

/**
 * Mapa CNJ (apenas dígitos) → sistema de tramitação detectado a partir de TODAS as
 * publicações daquele processo (um aviso de migração prevalece sobre o padrão do tribunal).
 */
export function useSistemaByCnj() {
  const { data } = useQuery({
    queryKey: ['sistema-by-cnj'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('intimations')
        .select('content, received_at')
        .order('received_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      const byCnj = new Map<string, string[]>();
      for (const row of (data || []) as { content: string }[]) {
        for (const cnj of extractCnjs(row.content)) {
          const key = cnj.replace(/\D/g, '');
          const arr = byCnj.get(key) || [];
          arr.push(row.content);
          byCnj.set(key, arr);
        }
      }
      const out = new Map<string, string>();
      byCnj.forEach((contents, key) => {
        const s = sistemaFromContents(contents);
        if (s) out.set(key, s);
      });
      return out;
    },
  });

  return (numero?: string | null): string | null => {
    if (!numero || !data) return null;
    return data.get(numero.replace(/\D/g, '')) ?? null;
  };
}
