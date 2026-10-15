import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { reviewTaskSuggestion } from '@/lib/taskSuggestionReview';
import { detectDeadline } from '@/lib/legalDeadlines';

const text = 'Intime-se o réu para apresentar contestação em 15 dias úteis.';
const base = {
  days: 15, unit: 'dias_uteis', dueDate: '2026-11-09', startDate: '2026-10-19',
  isFallback: false, triggerSource: 'literal_dispositivo', classificacaoStatus: 'auto_alta',
  pecaSugerida: { peca: 'Contestação', prazo_dias: 15 },
};
describe('três revisões distintas da tarefa', () => {
  it('aprova só quando as três verificações concordam com comando e intervalo expresso', () => {
    const result = reviewTaskSuggestion(text, base);
    expect(result.approved).toBe(true);
    expect(result.checks.map(check => check.stage)).toEqual(['command', 'recipient_deadline', 'conflict']);
    expect(result.checks.map(check => check.passed)).toEqual([true, true, true]);
  });
  it('primeira revisão rejeita apelação quando o comando é contraminuta', () => {
    const result = reviewTaskSuggestion('Intime-se o agravado para apresentar contraminuta em 15 dias úteis.', { ...base, pecaSugerida: { peca: 'Apelação', prazo_dias: 15 } });
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[2].passed).toBe(false);
    expect(result.approved).toBe(false);
  });
  it('segunda revisão rejeita destinatário genérico do ato real de 15/10', () => {
    const result = reviewTaskSuggestion('VISTA à(s) parte(s) para apresentar(em) contraminuta(s).', { ...base, pecaSugerida: { peca: 'Contraminuta', prazo_dias: 15 } });
    expect(result.checks[1].passed).toBe(false);
    expect(result.approved).toBe(false);
  });
  it.each([
    ['15 dias úteis', 5, 'dias_uteis'],
    ['15 dias corridos', 15, 'dias_uteis'],
    ['15 dias', 15, 'dias_uteis'],
  ])('segunda revisão rejeita quantidade/unidade incompatível: %s', (literal, days, unit) => {
    expect(reviewTaskSuggestion(`Intime-se o réu para apresentar contestação em ${literal}.`, { ...base, days, unit }).checks[1].passed).toBe(false);
  });
  it('terceira revisão rejeita alternativas mesmo com prazo e comando compatíveis', () => {
    const result = reviewTaskSuggestion(text, { ...base, pecaSugerida: { ...base.pecaSugerida, peca_alternativa: { peca: 'Apelação' } } });
    expect(result.checks[0].passed).toBe(true);
    expect(result.checks[1].passed).toBe(true);
    expect(result.checks[2].passed).toBe(false);
    expect(result.approved).toBe(false);
  });
  it('terceira revisão rejeita fallback', () => {
    expect(reviewTaskSuggestion(text, { ...base, isFallback: true }).checks[2].passed).toBe(false);
  });
  it('não aprova ambas as partes sem identificação individual', () => {
    expect(reviewTaskSuggestion('Vista às partes para apresentar contestação em 15 dias úteis.', base).approved).toBe(false);
  });
  it('mantém objeto e datas originais ao reter sugestão', () => {
    const before = structuredClone(base);
    reviewTaskSuggestion('Intime-se.', base);
    expect(base).toEqual(before);
  });
  it('retém manifestação genérica do motor quando o comando exige contestação', () => {
    const detected = detectDeadline(text, '2026-10-15', '2026-10-15', { tribunal: 'TJSP' });
    expect(detected.pecaSugerida.peca).toBe('Manifestação (15 dias)');
    expect(reviewTaskSuggestion(text, detected).checks[0].passed).toBe(false);
    expect(reviewTaskSuggestion(text, detected).approved).toBe(false);
  });
  it('navegador e funções usam as mesmas revisões e destinatários', () => {
    const read = (path: string) => readFileSync(path, 'utf8');
    expect(read('supabase/functions/_shared/taskSuggestionReview.ts')).toBe(read('src/lib/taskSuggestionReview.ts').replace("'./deadlineRecipient'", "'./deadlineRecipient.ts'"));
    expect(read('supabase/functions/_shared/deadlineRecipient.ts').split('\n').slice(1).join('\n')).toBe(read('src/lib/deadlineRecipient.ts').split('\n').slice(1).join('\n'));
  });
});