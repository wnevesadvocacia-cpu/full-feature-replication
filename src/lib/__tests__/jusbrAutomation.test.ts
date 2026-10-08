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

describe('adaptador DOM limitado e sem ciência', () => {
  it('preserva linhas iguais; vazio desconhecido e Domicílio não são enviados', async () => {
    const messages: any[] = []; let listener: any;
    const selected = { getAttribute: () => 'true', textContent: 'Diário da Justiça' };
    const cells = [row.cnj,'06/10/2026','TJSP'].map(textContent => ({ textContent }));
    let dataRows: any[] = [{ querySelectorAll: () => cells },{ querySelectorAll: () => cells }];
    const table = { querySelectorAll: (selector: string) => selector.startsWith('th') ? ['Processo','Data de disponibilização','Tribunal'].map(textContent => ({ textContent })) : dataRows };
    const context = vm.createContext({
      crypto: { randomUUID: () => owner }, location: { pathname: '/central-comunicacoes' },
      document: { documentElement: {}, querySelectorAll: (s: string) => s === '[role="tab"]' ? [selected] : [table] },
      getComputedStyle: () => ({ visibility: 'visible' }),
      MutationObserver: class { observe() {} }, setTimeout: () => 0, clearTimeout: () => {},
      chrome: { runtime: { onMessage: { addListener: (fn: any) => { listener = fn; } }, sendMessage: async (m: any) => { messages.push(m); return { ok: true }; } } },
    });
    (table as any).getClientRects = () => [1]; dataRows.forEach(r => { r.getClientRects = () => [1]; });
    vm.runInContext(fs.readFileSync('extension/jusbr/portal.js','utf8'), context);
    await new Promise(resolve => listener({ type: 'SCAN' }, {}, resolve));
    expect(messages.find(m => m.type === 'JUSBR_BATCH').batch.rows).toHaveLength(2);
    messages.length = 0; dataRows = [];
    await new Promise(resolve => listener({ type: 'SCAN' }, {}, resolve));
    expect(messages.some(m => m.type === 'JUSBR_BATCH')).toBe(false);
    expect(messages[0].message).toContain('NÃO confirmado');
    messages.length = 0; selected.textContent = 'Domicílio Eletrônico';
    await new Promise(resolve => listener({ type: 'SCAN' }, {}, resolve));
    expect(messages.some(m => m.type === 'JUSBR_BATCH')).toBe(false);
    expect(messages[0].message).toContain('Domicílio nunca');
  });
});
