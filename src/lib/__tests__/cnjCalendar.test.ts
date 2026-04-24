import { describe, it, expect } from 'vitest';
import { isBusinessDay, nextBusinessDay, previousBusinessDay, getCnjHolidays } from '../cnjCalendar';
import { getCityHolidays } from '../cityHolidays';

describe('cnjCalendar — feriados nacionais', () => {
  it('Confraternização Universal (01/01) é não-útil em qualquer ano', () => {
    expect(isBusinessDay('2024-01-01')).toBe(false);
    expect(isBusinessDay('2025-01-01')).toBe(false);
    expect(isBusinessDay('2026-01-01')).toBe(false);
  });

  it('Tiradentes (21/04) é não-útil', () => {
    expect(isBusinessDay('2025-04-21')).toBe(false);
  });

  it('Independência (07/09), Aparecida (12/10), Finados (02/11), Proclamação (15/11), Consciência Negra (20/11), Natal (25/12)', () => {
    expect(isBusinessDay('2025-09-07')).toBe(false);
    expect(isBusinessDay('2025-10-12')).toBe(false);
    expect(isBusinessDay('2025-11-02')).toBe(false);
    expect(isBusinessDay('2025-11-15')).toBe(false);
    expect(isBusinessDay('2025-11-20')).toBe(false);
    expect(isBusinessDay('2025-12-25')).toBe(false);
  });

  it('Páscoa móvel — Sexta Santa, Carnaval e Corpus Christi corretos por ano', () => {
    // 2024: Páscoa = 31/03 → Sexta Santa 29/03, Carnaval 12-13/02, Corpus 30/05
    const h2024 = getCnjHolidays(2024);
    expect(h2024.has('2024-03-29')).toBe(true);
    expect(h2024.has('2024-02-12')).toBe(true);
    expect(h2024.has('2024-02-13')).toBe(true);
    expect(h2024.has('2024-05-30')).toBe(true);
    // 2025: Páscoa = 20/04 → Sexta Santa 18/04, Carnaval 03-04/03, Corpus 19/06
    const h2025 = getCnjHolidays(2025);
    expect(h2025.has('2025-04-18')).toBe(true);
    expect(h2025.has('2025-03-03')).toBe(true);
    expect(h2025.has('2025-03-04')).toBe(true);
    expect(h2025.has('2025-06-19')).toBe(true);
    // 2026: Páscoa = 05/04 → Sexta Santa 03/04, Carnaval 16-17/02, Corpus 04/06
    const h2026 = getCnjHolidays(2026);
    expect(h2026.has('2026-04-03')).toBe(true);
    expect(h2026.has('2026-02-16')).toBe(true);
    expect(h2026.has('2026-02-17')).toBe(true);
    expect(h2026.has('2026-06-04')).toBe(true);
  });
});

describe('cnjCalendar — recesso forense (20/12 a 20/01)', () => {
  it('todos os dias do recesso são não-úteis (mesmo dias de semana)', () => {
    const recessDays = ['2025-12-20','2025-12-22','2025-12-29','2025-12-31','2026-01-02','2026-01-15','2026-01-20'];
    for (const d of recessDays) expect(isBusinessDay(d)).toBe(false);
  });

  it('21/01 retoma como dia útil quando cair em dia de semana', () => {
    // 21/01/2026 = quarta-feira
    expect(isBusinessDay('2026-01-21')).toBe(true);
  });
});

describe('cnjCalendar — sábados e domingos', () => {
  it('sábado (24/05/2025) e domingo (25/05/2025) não são úteis', () => {
    expect(isBusinessDay('2025-05-24')).toBe(false);
    expect(isBusinessDay('2025-05-25')).toBe(false);
  });
});

describe('cnjCalendar — nextBusinessDay com prorrogação', () => {
  it('sexta → segunda quando segunda é útil', () => {
    expect(nextBusinessDay('2025-05-23')).toBe('2025-05-26'); // sex 23 → seg 26
  });

  it('quarta véspera de feriado nacional pula para próximo útil', () => {
    // 06/09/2025 sábado, 07/09 domingo (Independência também). Próximo útil: 08/09 (segunda)
    expect(nextBusinessDay('2025-09-05')).toBe('2025-09-08');
  });

  it('19/12 pula todo o recesso → 21/01 (próximo útil)', () => {
    // 19/12/2025 sexta. nextBusinessDay → 22/12 (sábado→pula até depois de 20/01)
    // 20/01/2026 = terça (mas dentro do recesso) → 21/01 = quarta
    expect(nextBusinessDay('2025-12-19')).toBe('2026-01-21');
  });
});

describe('cnjCalendar — feriados estaduais e municipais', () => {
  it('São Paulo capital: 25/01 é feriado municipal (Aniversário)', () => {
    // 25/01/2025 = sábado, mas testamos a lógica: 25/01/2027 = segunda
    expect(getCityHolidays(2027, { uf: 'SP', city: 'São Paulo' }).has('2027-01-25')).toBe(true);
    expect(isBusinessDay('2027-01-25', { uf: 'SP', city: 'São Paulo' })).toBe(false);
    // Sem cidade → não é feriado
    expect(isBusinessDay('2027-01-25')).toBe(true);
  });

  it('Estado SP: 09/07 (Revolução Constitucionalista) é feriado estadual', () => {
    // 09/07/2025 = quarta
    expect(isBusinessDay('2025-07-09', { uf: 'SP' })).toBe(false);
    expect(isBusinessDay('2025-07-09')).toBe(true); // sem UF, é dia útil nacional
  });

  it('Salvador/BA: 02/07 (Independência da Bahia) é não-útil', () => {
    // 02/07/2025 = quarta
    expect(isBusinessDay('2025-07-02', { uf: 'BA', city: 'Salvador' })).toBe(false);
  });

  it('Rio de Janeiro capital: 20/01 (São Sebastião) — coincide com recesso', () => {
    // 20/01 já é não-útil pelo recesso, mas o feriado deve constar mesmo assim
    expect(getCityHolidays(2026, { uf: 'RJ', city: 'Rio de Janeiro' }).has('2026-01-20')).toBe(true);
  });

  it('cidade desconhecida não adiciona feriados extras', () => {
    expect(isBusinessDay('2025-07-09', { uf: 'XX', city: 'Cidade Inexistente' })).toBe(true);
  });
});

describe('previousBusinessDay', () => {
  it('segunda → sexta anterior', () => {
    expect(previousBusinessDay('2025-05-26')).toBe('2025-05-23');
  });
  it('21/01/2026 (após recesso) → 19/12/2025 (sexta antes do recesso)', () => {
    expect(previousBusinessDay('2026-01-21')).toBe('2025-12-19');
  });
});
