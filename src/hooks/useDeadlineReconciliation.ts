// SprintClosure Item 1 (híbrido) — Background reconciliation de prazos.
// Sprint Jurídico Crítico (POLICY FINAL): quando confiança < 0.8 OU status
// 'ambigua_urgente' / 'auto_baixa' → deadline = NULL (evita malpractice).
// A sugestão automática vai para deadline_sugerido_inseguro (jsonb, audit only).
// Push notification é disparada na primeira detecção de status inseguro.
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { detectDeadline } from '@/lib/legalDeadlines';
import { calculateDeadlineRPC } from '@/lib/calculateDeadlineRPC';

interface IntimForReconcile {
  id: string;
  user_id?: string;
  content: string;
  received_at: string;
  deadline: string | null;
  court?: string | null;
  classificacao_status?: string | null;
}

const RECONCILED = new Set<string>();
const CONCURRENCY = 10;
const UNSAFE_STATUSES = new Set(['ambigua_urgente', 'auto_baixa']);

async function runWithLimit<T>(items: T[], limit: number, worker: (it: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, queue.length); i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        try { await worker(next); } catch (err) { console.warn('[reconcile] worker error', err); }
      }
    })());
  }
  await Promise.all(workers);
}

function tribunalFromCourt(court?: string | null): string | null {
  if (!court) return null;
  const m = court.match(/^([A-Z]{2,5})/);
  return m ? m[1] : null;
}

export function useDeadlineReconciliation(items: IntimForReconcile[] | undefined): void {
  const qc = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!items || items.length === 0) return;
    if (ranRef.current) return;
    ranRef.current = true;

    const todo = items.filter((it) => !RECONCILED.has(it.id) && it.classificacao_status !== 'revisada_advogado');
    if (!todo.length) return;

    let updated = 0;
    runWithLimit(todo, CONCURRENCY, async (it) => {
      RECONCILED.add(it.id);
      const detected = detectDeadline(it.content, it.received_at.slice(0, 10), new Date().toISOString().slice(0, 10));
      if (!detected) return;

      const isUnsafe = detected.confianca < 0.8 || UNSAFE_STATUSES.has(detected.classificacaoStatus);

      let canonical: string | null = null;
      if (!isUnsafe && detected.dueDate && detected.days > 0) {
        canonical = await calculateDeadlineRPC({
          start: it.received_at.slice(0, 10),
          days: detected.days,
          tribunal: tribunalFromCourt(it.court),
          unit: detected.unit,
        });
      }

      const stored = it.deadline?.slice(0, 10) ?? null;
      const patch: Record<string, unknown> = {
        peca_sugerida: detected.pecaSugerida,
        base_legal: detected.baseLegal,
        confianca_classificacao: detected.confianca,
        classificacao_status: detected.classificacaoStatus,
      };

      if (isUnsafe) {
        // POLÍTICA DE SEGURANÇA JURÍDICA: nunca exibir prazo presumido
        patch.deadline = null;
        patch.deadline_sugerido_inseguro = {
          due_date: detected.dueDate,
          start_date: detected.startDate,
          days: detected.days,
          unit: detected.unit,
          label: detected.label,
          confianca: detected.confianca,
          classificacao_status: detected.classificacaoStatus,
          calculated_at: new Date().toISOString(),
        };
      } else if (canonical && stored !== canonical) {
        patch.deadline = canonical;
      }

      const { error } = await (supabase as any).from('intimations').update(patch).eq('id', it.id);
      if (!error) {
        updated++;
        // Push notification quando virou ambigua_urgente pela primeira vez
        if (isUnsafe && it.classificacao_status !== detected.classificacaoStatus && it.user_id) {
          await (supabase as any).from('notifications').insert({
            user_id: it.user_id,
            title: '⚠️ Prazo NÃO identificado — revisão urgente',
            message: `Intimação ${it.court ?? ''}: classificação automática não tem confiança suficiente. Defina o prazo manualmente.`,
            type: 'destructive',
            link: '/intimacoes',
          });
        }
      }
    }).then(() => {
      if (updated > 0) qc.invalidateQueries({ queryKey: ['intimations'] });
    });
  }, [items, qc]);
}
