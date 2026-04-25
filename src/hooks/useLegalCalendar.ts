// Hidrata o calendário legal global (suspensões + feriados de tribunal) a partir do banco.
// Deve ser montado uma única vez no AppLayout. Usa Realtime para refletir
// portarias adicionadas por admin sem refresh manual (zero perda de prazo).
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  setSuspensionWindow,
  setTribunalHolidaySet,
  clearLegalCalendarCache,
} from '@/lib/cnjCalendar';

interface Suspension { id: string; tribunal_codigo: string | null; start_date: string; end_date: string; reason: string }
interface TribunalHoliday { tribunal_codigo: string; holiday_date: string; description: string }

function expandRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + 'T12:00:00Z');
  const e = new Date(end + 'T12:00:00Z');
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function useLegalCalendar() {
  const qc = useQueryClient();

  const { data: suspensions = [] } = useQuery<Suspension[]>({
    queryKey: ['judicial_suspensions'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('judicial_suspensions').select('*');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: tHolidays = [] } = useQuery<TribunalHoliday[]>({
    queryKey: ['tribunal_holidays'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('tribunal_holidays').select('*');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 60 * 1000,
  });

  // Aplica nos sets globais usados por isBusinessDay
  useEffect(() => {
    clearLegalCalendarCache();
    const allSuspended: string[] = [];
    suspensions.forEach((s) => allSuspended.push(...expandRange(s.start_date, s.end_date)));
    setSuspensionWindow(allSuspended);

    const byTribunal = new Map<string, string[]>();
    tHolidays.forEach((h) => {
      const arr = byTribunal.get(h.tribunal_codigo) ?? [];
      arr.push(h.holiday_date);
      byTribunal.set(h.tribunal_codigo, arr);
    });
    byTribunal.forEach((dates, tribunal) => setTribunalHolidaySet(tribunal, dates));
  }, [suspensions, tHolidays]);

  // Realtime: portaria nova invalida cache imediatamente
  useEffect(() => {
    const ch = (supabase as any)
      .channel('legal-calendar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'judicial_suspensions' }, () => {
        qc.invalidateQueries({ queryKey: ['judicial_suspensions'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tribunal_holidays' }, () => {
        qc.invalidateQueries({ queryKey: ['tribunal_holidays'] });
      })
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [qc]);
}
