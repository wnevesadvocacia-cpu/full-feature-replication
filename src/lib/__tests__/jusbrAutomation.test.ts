import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateObservations, validCoverage, ownerMatches, targetedNumbers } from '../../../supabase/functions/_shared/jusbrBatch';
const row = { cnj: '1003778-63.2024.8.26.0084', date: '2026-10-06', court: 'TJSP' };
const owner = '00000000-0000-4000-8000-000000000001';
function core() {
  const context = vm.createContext({ crypto: { randomUUID: vi.fn().mockReturnValueOnce('batch-1').mockReturnValue('batch-2') }, Date });
  vm.runInContext(fs.readFileSync('extension/jusbr/core.js', 'utf8'), context);
  return context.JusbrCore;
}
describe('Jus.br automação segura', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T16:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  it('pagina três páginas e preserva dois atos com os mesmos metadados', async () => {
    const c = core(); const emit = vi.fn(); const save = vi.fn(); const next = vi.fn();
    const read = vi.fn(async (page: number) => ({ rows: page === 1 ? [row, row] : [row], signature: String(page), next: page < 3, end: page === 3 }));
    await c.collect({ verified: true, search: vi.fn(), read, next }, { run: owner, page: 1, seen: [] }, save, emit);
    expect(read.mock.calls.map(args => args[0])).toEqual([1,2,3]);
    expect(next).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][0].rows).toHaveLength(2);
    expect(save.mock.calls.at(-1)?.[0].finished).toBe(true);
  });
  it('retoma transporte interrompido com mesmo lote e mesma página', async () => {
    const c = core(); let checkpoint: any;
    const save = vi.fn(async (state: any) => { checkpoint = state; });
    const adapter = { verified: true, search: vi.fn(), read: vi.fn(async () => ({ rows: [row], signature: '1', end: true })) };
    const failed = vi.fn(async () => { throw Error('offline'); });
    await expect(c.collect(adapter, { run: owner, page: 1, seen: [] }, save, failed)).rejects.toThrow('offline');
    const sentId = checkpoint.batchId;
    const retry = vi.fn();
    await c.collect(adapter, checkpoint, save, retry);
    expect(retry.mock.calls[0][0].id).toBe(sentId);
    expect(retry.mock.calls[0][0].coverage.page).toBe(1);
  });
  it('retoma na próxima página após interrupção de navegação', async () => {
    const c = core(); let checkpoint: any;
    const save = async (state: any) => { checkpoint = state; };
    const adapter = { verified: true, search: vi.fn(), read: vi.fn(async () => ({ rows: [row], signature: '1', next: true })), next: vi.fn(async () => { throw Error('interrompido'); }) };
    await expect(c.collect(adapter, { run: owner, page: 1, seen: [] }, save, vi.fn())).rejects.toThrow('interrompido');
    expect(checkpoint.page).toBe(2);
    const search = vi.fn(); const emit = vi.fn();
    await c.collect({ verified: true, search, read: vi.fn(async () => ({ rows: [row], signature: '2', end: true })) }, checkpoint, save, emit);
    expect(search.mock.calls[0][0].page).toBe(2);
    expect(emit.mock.calls[0][0].coverage.page).toBe(2);
  });
  it('não aceita vazio sem evidência; aceita vazio explícito apenas no adaptador verificado', async () => {
    const c = core(); const emit = vi.fn();
    await expect(c.collect({ verified: true, search: vi.fn(), read: async () => ({ rows: [], end: true }) }, { run: owner, page: 1, seen: [] }, vi.fn(), emit)).rejects.toThrow('Vazio');
    expect(emit).not.toHaveBeenCalled();
    await c.collect({ verified: true, search: vi.fn(), read: async () => ({ rows: [], empty: true, end: true, signature: 'empty' }) }, { run: owner, page: 1, seen: [] }, vi.fn(), emit);
    expect(emit.mock.calls[0][0].coverage.kind).toBe('empty');
  });
  it('bloqueia controles não verificados e páginas repetidas', async () => {
    const c = core(); const search = vi.fn();
    await expect(c.collect({ verified: false, search }, null, vi.fn(), vi.fn())).rejects.toThrow('sem evidência');
    expect(search).not.toHaveBeenCalled();
    await expect(c.collect({ verified: true, search, read: async () => ({ rows: [row], signature: 'same', next: true }), next: vi.fn() }, { run: owner, page: 1, seen: [] }, vi.fn(), vi.fn())).rejects.toThrow('Página repetida');
  });
  it('deduplica replay de lote sem bloquear páginas diferentes; isola contas', () => {
    const c = core();
    let state = c.enqueue({ owner, queue: [] }, owner, { id: '1', rows: [row] });
    state = c.enqueue(state, owner, { id: '1', rows: [row] });
    state = c.enqueue(state, owner, { id: '2', rows: [row] });
    expect(state.queue).toHaveLength(2);
    expect(() => c.enqueue(state, 'other', { id: '3' })).toThrow('Conta diferente');
    expect(() => c.acknowledge(state, 'other', '1')).toThrow('Conta diferente');
    expect(c.acknowledge(state, owner, '1').queue[0].id).toBe('2');
    expect(ownerMatches({ user_id: owner }, 'other')).toBe(false);
  });
  it('retentativa progressiva e janela incremental com sobreposição', () => {
    const c = core();
    expect(c.retry({ attempts: 0 }, 0).retryAt).toBe(60000);
    expect(c.retry({ attempts: 6 }, 0).retryAt).toBe(3600000);
    expect(c.window('2026-10-07').start).toBe('2026-09-30');
    expect(c.window(null).start).toBe('2026-07-10');
  });
  it('divide janela de 90 dias em segmentos de no máximo sete dias sem lacunas', () => {
    const c = core(); const periods = c.segments(c.window(null));
    expect(periods[0].start).toBe('2026-07-10'); expect(periods.at(-1).end).toBe('2026-10-08');
    expect(periods).toHaveLength(13);
    periods.forEach((p: any, i: number) => {
      expect((Date.parse(p.end) - Date.parse(p.start)) / 86400000).toBeLessThanOrEqual(6);
      if (i) expect(Date.parse(p.start) - Date.parse(periods[i-1].end)).toBe(86400000);
    });
  });
  it('subdivide truncamento recursivamente e nunca emite dados truncados', async () => {
    const c = core(); const emit = vi.fn(); let saved: any;
    const factory = (p: any) => ({ verified: true, search: async () => { if (p.start !== p.end) throw Object.assign(Error('100'), { code: 'TRUNCATED' }); }, read: async () => ({ rows: [row], signature: p.start, end: true }) });
    await c.collectSegments(factory, { run: owner, period: { start: '2026-10-01', end: '2026-10-07' }, page: 1, seen: [] }, async (s: any) => { saved = s; }, emit);
    expect(emit).toHaveBeenCalledTimes(7); expect(saved.finished).toBe(true); expect(saved.segments).toHaveLength(7);
  });
  it('dia único truncado preserva checkpoint sem concluir nem emitir lote', async () => {
    const c = core(); const emit = vi.fn(); let saved: any;
    const factory = () => ({ verified: true, search: async () => { throw Object.assign(Error('100'), { code: 'TRUNCATED' }); } });
    await expect(c.collectSegments(factory, { run: owner, period: { start: '2026-10-08', end: '2026-10-08' }, page: 1, seen: [] }, async (s: any) => { saved = s; }, emit)).rejects.toThrow('Dia único truncado');
    expect(saved.finished).toBe(false); expect(saved.period.start).toBe('2026-10-08'); expect(emit).not.toHaveBeenCalled();
  });
  it('retoma segmento com ID imutável após falha e não repete segmento anterior', async () => {
    const c = core(); let saved: any; let fail = true;
    const factory = (p: any) => ({ verified: true, search: vi.fn(), read: async () => ({ rows: [row], signature: p.start, end: true }) });
    const initial = { run: owner, period: { start: '2026-10-01', end: '2026-10-08' }, page: 1, seen: [] };
    const emit = vi.fn(async () => { if (emit.mock.calls.length === 2 && fail) throw Error('offline'); });
    const save = async (s: any) => { saved = s; };
    await expect(c.collectSegments(factory, initial, save, emit)).rejects.toThrow('offline');
    expect(saved.segmentIndex).toBe(1); const id = saved.batchId; fail = false;
    const retry = vi.fn(); await c.collectSegments(factory, saved, save, retry);
    expect(retry).toHaveBeenCalledTimes(1); expect(retry.mock.calls[0][0].id).toBe(id); expect(saved.finished).toBe(true);
  });
  it('servidor preserva ocorrências, direciona CNJs únicos e rejeita datas/vazio sem evidência', () => {
    const rows = validateObservations([row,row]);
    expect(rows).toHaveLength(2);
    expect(rows[0].occurrence).not.toBe(rows[1].occurrence);
    expect(targetedNumbers(rows)).toEqual([row.cnj]);
    expect(() => validateObservations([{ ...row, date: '2026-02-30' }])).toThrow();
    expect(() => validCoverage({ run: owner, page: 1, kind: 'visible' }, [])).toThrow('Vazio');
    expect(validCoverage({ run: owner, page: 1, kind: 'empty' }, []).complete).toBe(false);
  });
});

