import { afterEach, describe, expect, it } from 'vitest';
import { detectDeadline } from '../legalDeadlines';
import * as browser from '../cnjCalendar';
import * as edge from '../../../supabase/functions/_shared/cnjCalendar';
import { detectDeadline as edgeDetect } from '../../../supabase/functions/_shared/legalDeadlines';

afterEach(() => { browser.clearLegalCalendarCache(); edge.clearLegalCalendarCache(); });

describe.each([['browser', detectDeadline, browser], ['edge', edgeDetect, edge]] as const)('%s: rito e calendário', (_name, detect, calendar) => {
  it('CPP: cinco dias sem unidade são corridos, prorrogados após domingo', () => {
    const result = detect('Vara Criminal. Fica a defesa intimada para, no prazo de 5 dias, apresentar resposta.', '2025-05-20', '2025-05-20');
    expect(result?.source).toBe('CPP');
    expect(result?.unit).toBe('dias_corridos');
    expect(result?.dueDate).toBe('2025-05-26');
  });
  it('CPC junto ao comando prevalece sobre CPP anteriormente mencionado', () => {
    const result = detect('Referência ao CPP. Determino que apresente manifestação no prazo de 5 dias, nos termos do CPC.', '2025-05-20', '2025-05-20');
    expect(result?.source).toBe('CPC');
    expect(result?.dueDate).toBe('2025-05-28');
  });
  it('CLT: prazo literal usa dias úteis e rito trabalhista', () => {
    const result = detect('Vara do Trabalho. Apresente manifestação no prazo de 5 dias.', '2025-05-20', '2025-05-20');
    expect(result?.source).toBe('CLT');
    expect(result?.unit).toBe('dias_uteis');
    expect(result?.dueDate).toBe('2025-05-28');
  });
  it('JEC: prazo literal segue dias úteis', () => {
    const result = detect('Juizado Especial Cível. Apresente manifestação no prazo de 5 dias.', '2025-05-20', '2025-05-20');
    expect(result?.source).toBe('JEC');
    expect(result?.unit).toBe('dias_uteis');
  });
  it('preserva unidade expressa no ato', () => {
    expect(detect('CPP. Apresente resposta no prazo de 5 dias úteis.', '2025-05-20', '2025-05-20')?.unit).toBe('dias_uteis');
  });
  it('feriado TJSP afeta publicação e vencimento, mas não TJMG', () => {
    calendar.setTribunalHolidaySet('TJSP', ['2025-05-21']);
    const text = 'Apresente manifestação no prazo de 5 dias.';
    expect(detect(text, '2025-05-20', '2025-05-20', { tribunal: 'TJSP' })?.dueDate).toBe('2025-05-29');
    expect(detect(text, '2025-05-20', '2025-05-20', { tribunal: 'TJMG' })?.dueDate).toBe('2025-05-28');
  });
  it('suspensão TJSP não bloqueia TJMG; suspensão geral afeta ambos', () => {
    calendar.setSuspensionWindow(['2025-05-22'], 'TJSP');
    expect(calendar.isBusinessDay('2025-05-22', { tribunal: 'TJSP' })).toBe(false);
    expect(calendar.isBusinessDay('2025-05-22', { tribunal: 'TJMG' })).toBe(true);
    calendar.setSuspensionWindow(['2025-05-23']);
    expect(calendar.isBusinessDay('2025-05-23', { tribunal: 'TJMG' })).toBe(false);
  });
  it('TRT02 e TRT-2 consultam as mesmas datas', () => {
    calendar.setTribunalHolidaySet('TRT-2', ['2025-05-22']);
    expect(calendar.isBusinessDay('2025-05-22', { tribunal: 'TRT02' })).toBe(false);
    expect(calendar.isBusinessDay('2025-05-22', { tribunal: 'TRT03' })).toBe(true);
  });
  it('CPP suspende contagem no período do art. 798-A', () => {
    const result = detect('CPP. Apresente resposta no prazo de 5 dias.', '2025-12-17', '2025-12-17');
    expect(result?.startDate).toBe('2025-12-19');
    expect(result?.dueDate).toBe('2026-01-26');
  });
  it('réu preso: não aplica suspensão do art. 798-A', () => {
    const result = detect('CPP. Réu preso. Apresente resposta no prazo de 5 dias.', '2025-12-17', '2025-12-17');
    expect(result?.ignoreRecess).toBe(true);
    expect(result?.dueDate).toBe('2025-12-23');
  });
  it('CPP não dobra prazo literal para Ministério Público', () => {
    const result = detect('CPP. Ministério Público intimado para apresentar resposta no prazo de 5 dias.', '2025-05-20', '2025-05-20');
    expect(result?.doubled).toBe(false);
    expect(result?.days).toBe(5);
  });
});