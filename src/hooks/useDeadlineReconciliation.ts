// SprintClosure Item 1 (híbrido) — Background reconciliation de prazos.
// Sprint Jurídico Crítico: além de reconciliar deadline com a RPC canônica,
// agora também grava peca_sugerida, base_legal, confianca_classificacao e
// classificacao_status — exceto quando registro já foi 'revisada_advogado'.
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { detectDeadline } from '@/lib/legalDeadlines';
import { calculateDeadlineRPC } from '@/lib/calculateDeadlineRPC';

interface IntimForReconcile {
  id: string;
  content: string;
  received_at: string;
  deadline: string | null;
  court?: string | null;
  classificacao_status?: string | null;
}

const RECONCILED = new Set<string>();
const CONCURRENCY = 10;

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

      let canonical: string | null = null;
      if (detected.dueDate && detected.days > 0) {
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
      if (canonical && stored !== canonical) patch.deadline = canonical;

      const { error } = await (supabase as any).from('intimations').update(patch).eq('id', it.id);
      if (!error) {
        updated++;
        if (canonical && stored !== canonical) {
          console.info(`[reconcile] intimação ${it.id} ajustada: ${stored} -> ${canonical} (${detected.classificacaoStatus})`);
        }
      }
    }).then(() => {
      if (updated > 0) qc.invalidateQueries({ queryKey: ['intimations'] });
    });
  }, [items, qc]);
}
