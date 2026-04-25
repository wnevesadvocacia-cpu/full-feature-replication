// GAP 4: Realtime para intimations / processes / tasks.
// Invalida o cache do React Query ao receber INSERT/UPDATE/DELETE para que a UI
// reflita imediatamente sem refresh manual (perda de prazo = malpractice).
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useRealtimeIntimacoes() {
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const ch = (supabase as any)
      .channel('rt-intimacoes-processos-tarefas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intimations' }, (payload: any) => {
        qc.invalidateQueries({ queryKey: ['intimations'] });
        if (payload.eventType === 'INSERT') {
          const newRow = payload.new;
          toast({
            title: '📬 Nova intimação recebida',
            description: newRow?.court || 'Verifique a página de Intimações',
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'processes' }, () => {
        qc.invalidateQueries({ queryKey: ['processes'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        qc.invalidateQueries({ queryKey: ['tasks'] });
      })
      .subscribe();

    return () => { (supabase as any).removeChannel(ch); };
  }, [qc, toast]);
}
