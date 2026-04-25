// SprintClosure Item 1 (híbrido) — Background reconciliation de prazos.
// Estratégia:
//   1. UI continua usando detectDeadline() síncrono (legalDeadlines.ts) para
//      renderização instantânea — zero mudança visual.
//   2. Em background, este hook chama a RPC public.calculate_deadline (fonte
//      única de verdade SQL) para cada intimação carregada e, se divergir de
//      intimations.deadline armazenado, atualiza o registro.
//   3. Reconciliação é idempotente, rate-limited (10 RPCs paralelas) e
//      silenciosa em caso de erro (não bloqueia UX).
//
// Por que importa: garante que o vencimento exibido na UI sempre converge para
// o cálculo canônico do Postgres (que usa judicial_suspensions e
// tribunal_holidays do banco), sem forçar refactor async em todo lugar.
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
}

const RECONCILED = new Set<string>(); // memoiza por sessão para não retrabalhar
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
  // Court vem como "TJSP - 2ª Vara Cível" ou só "TJSP"
  const m = court.match(/^([A-Z]{2,5})/);
  return m ? m[1] : null;
}

export function useDeadlineReconciliation(items: IntimForReconcile[] | undefined): void {
  const qc = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!items || items.length === 0) return;
    // Roda apenas uma vez por mount — invalida cache no final para refetch fresh
    if (ranRef.current) return;
    ranRef.current = true;

    const todo = items.filter((it) => !RECONCILED.has(it.id));
    if (!todo.length) return;

    let updated = 0;
    runWithLimit(todo, CONCURRENCY, async (it) => {
      RECONCILED.add(it.id);
      const detected = detectDeadline(it.content, it.received_at.slice(0, 10), new Date().toISOString().slice(0, 10));
      if (!detected || !detected.dueDate || detected.days <= 0) return;

      const canonical = await calculateDeadlineRPC({
        start: it.received_at.slice(0, 10),
        days: detected.days,
        tribunal: tribunalFromCourt(it.court),
        unit: detected.unit,
      });
      if (!canonical) return;

      const stored = it.deadline?.slice(0, 10) ?? null;
      if (stored === canonical) return; // já está canônico

      // Divergência detectada — atualiza no DB
      const { error } = await supabase
        .from('intimations')
        .update({ deadline: canonical })
        .eq('id', it.id);
      if (!error) {
        updated++;
        console.info(`[reconcile] intimação ${it.id} ajustada: ${stored} -> ${canonical}`);
      }
    }).then(() => {
      if (updated > 0) {
        qc.invalidateQueries({ queryKey: ['intimations'] });
      }
    });
  }, [items, qc]);
}
