// Sprint1.9: helper TS que delega o cálculo do vencimento para a RPC
// `public.calculate_deadline` no Postgres. Garante fonte única de verdade
// para feriados/suspensões/recesso entre frontend e edges.
//
// Uso:
//   const due = await calculateDeadlineRPC({ start: '2026-04-25', days: 15, tribunal: 'TJSP' });
//
// Regex/identificação do número de dias permanece em src/lib/legalDeadlines.ts (TS),
// conforme decisão aprovada — apenas o cálculo da data final foi movido para SQL.
import { supabase } from '@/integrations/supabase/client';

export interface CalcDeadlineInput {
  start: string;            // ISO YYYY-MM-DD (data de disponibilização / received_at)
  days: number;             // nº de dias (já em dobro se for o caso)
  tribunal?: string | null; // ex.: 'TJSP', 'TRF3'
  unit?: 'dias_uteis' | 'dias_corridos';
}

export async function calculateDeadlineRPC(input: CalcDeadlineInput): Promise<string | null> {
  if (!input.start || !input.days || input.days <= 0) return null;
  const { data, error } = await (supabase as any).rpc('calculate_deadline', {
    _start_date: input.start,
    _days: input.days,
    _tribunal: input.tribunal ?? null,
    _unit: input.unit ?? 'dias_uteis',
  });
  if (error) {
    console.error('[calculateDeadlineRPC] erro:', error);
    return null;
  }
  return (data as string) ?? null;
}
