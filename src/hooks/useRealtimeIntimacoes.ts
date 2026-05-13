// GAP 4 + cross-page sync: Realtime para intimations, processes, tasks,
// process_comments e documents. Invalida TODAS as queryKeys relacionadas
// (lista global, lista por processo, agenda, CRM) para que mudanças em
// uma página reflitam imediatamente nas outras.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useRealtimeIntimacoes() {
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const ch = (supabase as any)
      .channel('rt-pipeline-unificado')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intimations' }, (payload: any) => {
        qc.invalidateQueries({ queryKey: ['intimations'] });
        if (payload.eventType === 'INSERT') {
          toast({
            title: '📬 Nova intimação recebida',
            description: payload.new?.court || 'Verifique a página de Intimações',
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'processes' }, () => {
        qc.invalidateQueries({ queryKey: ['processes'] });
        qc.invalidateQueries({ queryKey: ['crm-processes'] });
        qc.invalidateQueries({ queryKey: ['process-list'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        // Pipeline Processo ↔ Tarefa ↔ Agenda
        qc.invalidateQueries({ queryKey: ['tasks'] });
        qc.invalidateQueries({ queryKey: ['agenda-tasks'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'process_comments' }, () => {
        qc.invalidateQueries({ queryKey: ['proc-movs'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        qc.invalidateQueries({ queryKey: ['proc-docs'] });
        qc.invalidateQueries({ queryKey: ['documents'] });
      })
      .subscribe();

    return () => { (supabase as any).removeChannel(ch); };
  }, [qc, toast]);
}
