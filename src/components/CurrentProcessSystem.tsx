import { useQuery } from '@tanstack/react-query';
import { Loader2, Monitor } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { maskCnj } from '@/lib/cnjRegex';
import { currentProcessSystem } from '@/lib/currentProcessSystem';
import { todayISO, formatBR } from '@/lib/cnjCalendar';

export function CurrentProcessSystem({ numero }: { numero: string }) {
  const { user } = useAuth();
  const masked = maskCnj(numero);
  const today = todayISO();
  const { data, isPending, isError } = useQuery({
    queryKey: ['current-process-system', user?.id, masked, today],
    enabled: !!user && !!masked,
    staleTime: 0,
    queryFn: async () => {
      if (!masked || !user) throw new Error('Processo ou sessão indisponível');
      const events: { content: string; date: string }[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data: rows, error } = await supabase.from('intimations')
          .select('id, content, received_at')
          .or(`content.ilike.%${masked}%,content.ilike.%${masked.replace(/\D/g, '')}%`)
          .lte('received_at', today)
          .order('received_at', { ascending: false }).order('id', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        for (const row of rows || []) events.push({ content: row.content, date: row.received_at });
        if (!rows || rows.length < pageSize) break;
      }
      return currentProcessSystem(masked, events, today);
    },
  });
  const loading = !!user && !!masked && isPending;
  const diagnostic = isError ? 'Não foi possível consultar as publicações.'
    : data?.reason === 'migration' ? 'Migração mencionada; conclusão ainda não comprovada.'
    : data?.reason === 'conflict' ? 'Publicações com sistemas divergentes; confirme no tribunal.'
    : 'Sem evidência individual suficiente nas publicações disponíveis.';
  return (
    <div className="flex items-start gap-2 border-b border-border pb-3" aria-live="polite">
      <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm"><span className="text-muted-foreground">Sistema: </span>
          <span className="font-semibold text-foreground">{loading ? 'Consultando…' : data?.sistema || 'Não confirmado'}</span>
          {loading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
        </p>
        {!loading && <p className="text-xs text-muted-foreground">{data?.sistema && !isError
          ? `Identificado na publicação de ${formatBR(data.date || '')}. Situação atual no tribunal não verificada.`
          : diagnostic}</p>}
      </div>
    </div>
  );
}