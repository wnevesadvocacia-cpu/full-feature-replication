import { describe, it, expect } from 'vitest';
import { detectDeadline, addBusinessDays, businessDaysBetween } from '../legalDeadlines';

// Regra adotada (CPC art. 224 §3º + art. 219):
//   disponibilização (received_at) → publicação = nextBusinessDay(received_at)
//   início da contagem (startDate)   = nextBusinessDay(publicação)
//   vencimento (dueDate)             = publicação + N dias úteis (addBusinessDays já pula o dia inicial)
//
// Cenários reais para validar contra calendário CNJ:

describe('legalDeadlines — datas de início e vencimento', () => {
  it('Contestação (15 d.u.) disponibilizada quinta 22/05/2025 → publicação sex 23/05, início seg 26/05, vencimento 13/06', () => {
    const det = detectDeadline('Apresente contestação no prazo legal', '2025-05-22', '2025-05-22');
    expect(det).not.toBeNull();
    expect(det!.label).toBe('Contestação');
    expect(det!.days).toBe(15);
    expect(det!.startDate).toBe('2025-05-26');
    // Contagem: 26/05 (1), 27 (2), 28 (3), 29 (4), 30 (5), 02/06 (6), 03 (7), 04 (8), 05 (9), 06 (10),
    //           09/06 (11), 10 (12), 11 (13), 12 (14), 13 (15)
    expect(det!.dueDate).toBe('2025-06-13');
  });

  it('Embargos de Declaração (5 d.u.) disponibilizado sexta 18/04/2025 = Sexta Santa (feriado)', () => {
    // 18/04/2025 não-útil (Sexta Santa). Publicação = próximo útil = seg 21/04? Não — 21/04 = Tiradentes.
    // Próximo útil real: 22/04/2025 (terça). Início contagem: 23/04. Vencimento: 22+5 = 28/04? Vamos calcular:
    // publicação = 22/04 (terça). addBusinessDays(22/04, 5): 23 (1), 24 (2), 25 (3), 28 (4), 29 (5)
    const det = detectDeadline('Oponho embargos de declaração', '2025-04-18', '2025-04-22');
    expect(det!.label).toBe('Embargos de Declaração');
    expect(det!.startDate).toBe('2025-04-23');
    expect(det!.dueDate).toBe('2025-04-29');
  });

  it('Recesso forense: disponibilização 18/12/2025 (quinta) com prazo de 5 dias úteis pula o recesso inteiro', () => {
    const det = detectDeadline('Manifeste-se no prazo de 5 dias', '2025-12-18', '2025-12-18');
    // publicação = 19/12 (sex), próximo útil após recesso = 21/01/2026 (quarta)
    // addBusinessDays(19/12, 5): conta 5 dias úteis a partir de 19/12 PULANDO o dia inicial.
    // 19/12 (dia inicial pulado) → próximo útil 21/01 (1), 22/01 (2), 23/01 (3), 26/01 (4), 27/01 (5)
    expect(det!.startDate).toBe('2026-01-21');
    expect(det!.dueDate).toBe('2026-01-27');
  });

  it('Fazenda Pública: prazo em dobro (art. 183 CPC) — Apelação (15 → 30 d.u.)', () => {
    const det = detectDeadline('A FAZENDA PÚBLICA Estadual interpõe apelação', '2025-05-22', '2025-05-22');
    expect(det!.doubled).toBe(true);
    expect(det!.days).toBe(30);
    // publicação 23/05 + 30 d.u. úteis (sem feriados além de Corpus 19/06):
    // 26 (1) 27 (2) 28 (3) 29 (4) 30 (5) | 02/06 (6) 03 (7) 04 (8) 05 (9) 06 (10) |
    // 09 (11) 10 (12) 11 (13) 12 (14) 13 (15) | 16 (16) 17 (17) 18 (18) — 19/06 Corpus pulado — 20 (19) |
    // 23 (20) 24 (21) 25 (22) 26 (23) 27 (24) | 30 (25) 01/07 (26) 02 (27) 03 (28) 04 (29) | 07 (30)
    expect(det!.dueDate).toBe('2025-07-07');
  });

  it('Fallback (regra geral CPC art. 218 §3º): texto sem prazo expresso → 5 dias úteis', () => {
    const det = detectDeadline('Cumpra-se o despacho proferido nos autos.', '2025-05-22', '2025-05-22');
    expect(det!.isFallback).toBe(true);
    expect(det!.days).toBe(5);
    expect(det!.label).toContain('regra geral');
    expect(det!.startDate).toBe('2025-05-26');
    // 23/05 + 5 d.u.: 26 (1) 27 (2) 28 (3) 29 (4) 30 (5)
    expect(det!.dueDate).toBe('2025-05-30');
  });

  it('Reconhece prazo expresso com numeral por extenso entre parênteses: 30 (trinta) dias', () => {
    const det = detectDeadline('Aguarde-se a apresentação de eventuais requerimentos nos autos pelo prazo de 30 (trinta) dias.', '2026-04-24', '2026-04-24');
    expect(det).not.toBeNull();
    expect(det!.isFallback).toBe(false);
    expect(det!.days).toBe(30);
    expect(det!.label).toBe('Manifestação (30 dias)');
    expect(det!.startDate).toBe('2026-04-28');
    expect(det!.dueDate).toBe('2026-06-10');
  });

  it('Vencimento em dia não-útil prorroga para próximo útil', () => {
    // Manifestação 10 dias disponibilizada 06/05/2025 (terça) → publicação 07/05 (quarta)
    // addBusinessDays(07/05, 10): 08 (1) 09 (2) 12 (3) 13 (4) 14 (5) 15 (6) 16 (7) 19 (8) 20 (9) 21 (10) → 21/05 (quarta, útil) ✓
    const det = detectDeadline('Manifeste-se no prazo de 10 dias', '2025-05-06', '2025-05-06');
    expect(det!.dueDate).toBe('2025-05-21');
  });
});

describe('legalDeadlines — utilitários', () => {
  it('addBusinessDays pula sábado/domingo', () => {
    // sex 23/05/2025 + 1 = seg 26/05
    expect(addBusinessDays('2025-05-23', 1)).toBe('2025-05-26');
  });

  it('businessDaysBetween conta corretamente entre datas em meses diferentes', () => {
    // 26/05 → 13/06/2025 (vencimento da contestação): 14 dias úteis avante
    expect(businessDaysBetween('2025-05-26', '2025-06-13')).toBe(14);
  });

  it('businessDaysBetween retorna negativo para data passada', () => {
    expect(businessDaysBetween('2025-06-13', '2025-05-26')).toBe(-14);
  });
});
