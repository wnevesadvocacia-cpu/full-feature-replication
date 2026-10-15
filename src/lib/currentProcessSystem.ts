import { extractCnjs } from '@/lib/cnjRegex';
import { sistemaFromContent, type SistemaEvent } from '@/lib/cnjTribunal';

export type CurrentProcessSystem = {
  sistema: string | null;
  date: string | null;
  reason: 'evidence' | 'unknown' | 'conflict' | 'migration';
};

/** Evidence for this process only; tribunal defaults are never individual proof. */
export function currentProcessSystem(numero: string, events: SistemaEvent[], today: string): CurrentProcessSystem {
  const digits = numero.replace(/\D/g, '');
  const unknown: CurrentProcessSystem = { sistema: null, date: null, reason: 'unknown' };
  if (digits.length !== 20) return unknown;
  const candidates: { sistema: string | null; date: string; migration: boolean }[] = [];
  for (const event of events) {
    const content = event.content || '';
    const [primary] = extractCnjs(content);
    const date = event.date?.slice(0, 10);
    if (primary?.replace(/\D/g, '') !== digits || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) continue;
    // Future/ambiguous migration notices are not proof that the move happened.
    const migration = /passar[áa]\s+a\s+tramitar|tramitar[áa]|migra[çc][ãa]o|implanta[çc][ãa]o/i.test(content);
    const transition = /(?:passou\s+a\s+tramitar|migrad[oa]\s+para|redistribu[íi]d[oa]\s+para)\s*(?:o\s+)?(?:sistema\s+)?(e-?proc|pje|e-?saj|projudi|themis|libra)\b/i.exec(content);
    const names = new Set((content.match(/\be-?proc\b|\bpje\b|\be-?saj\b|\bprojudi\b|\bthemis\b|\blibra\b/gi) || []).map(name => sistemaFromContent(name)));
    const sistema = transition ? sistemaFromContent(transition[1]) : names.size > 1 ? null : sistemaFromContent(content);
    if (sistema || names.size > 1 || migration) candidates.push({ sistema, date, migration: migration && !transition });
  }
  if (!candidates.length) return unknown;
  const date = candidates.reduce((latest, event) => event.date > latest ? event.date : latest, '');
  const latest = candidates.filter(event => event.date === date);
  if (latest.some(event => event.migration)) return { sistema: null, date, reason: 'migration' };
  const systems = new Set(latest.map(event => event.sistema));
  if (systems.size !== 1 || systems.has(null)) return { sistema: null, date, reason: 'conflict' };
  return { sistema: latest[0].sistema, date, reason: 'evidence' };
}