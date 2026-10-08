import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readJusbrRows, unmatchedJusbrRows } from '../jusbrCheck';

const row = { cnj: '1003778-63.2024.8.26.0084', date: '2026-10-06', court: 'TJSP' };
describe('conferência complementar Jus.br', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T16:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  it('preserva atos diferentes com metadados iguais, sem criar publicação a partir do resumo', () => {
    expect(readJusbrRows([row, row])).toEqual([row, row]);
  });
  it('rejeita metadados e datas inválidas', () => {
    expect(() => readJusbrRows([{ ...row, date: '2026-02-30' }])).toThrow();
    expect(() => readJusbrRows([{ ...row, cnj: 'incorreto' }])).toThrow();
  });
  it('falha fechado no limite de linhas e em resultado vazio', () => {
    expect(() => readJusbrRows(Array(101).fill(row))).toThrow();
    expect(() => readJusbrRows([])).toThrow();
  });
  it('não usa publicação de outro usuário como correspondência', () => {
    const records = [{ user_id: 'other', content: row.cnj, received_at: row.date, court: 'TJSP' }];
    expect(unmatchedJusbrRows([row], records, 'owner')).toEqual([row]);
  });
  it('exige CNJ completo, data e tribunal para correspondência provisória', () => {
    const record = { user_id: 'owner', content: `Processo: ${row.cnj}`, received_at: row.date, court: 'TJSP' };
    expect(unmatchedJusbrRows([row], [record], 'owner')).toEqual([]);
    expect(unmatchedJusbrRows([row], [{ ...record, received_at: '2026-10-07' }], 'owner')).toEqual([row]);
    expect(unmatchedJusbrRows([row], [{ ...record, court: 'TJMT' }], 'owner')).toEqual([row]);
  });
  it('não aceita período além da janela redundante de 90 dias', () => {
    expect(() => readJusbrRows([{ ...row, date: '2026-01-01' }])).toThrow();
  });
});