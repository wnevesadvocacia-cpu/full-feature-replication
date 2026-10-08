import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
const cnj = '1003778-63.2024.8.26.0084';
function fixture() {
  document.body.innerHTML = `<div id="tabs_comunicacoes_processuais"><button role="tab" aria-selected="true">Diário da Justiça</button><button role="tab">Domicílio Eletrônico</button></div>
  <form id="form_busca_diario_justica"><label>Número do Processo<input></label><label>Número da OAB<input></label><label>Início<input></label><label>Fim<input></label><button type="button">Buscar</button></form>
  <div id="diario_justica_tabela"><table><thead><tr>${['Processo','Partes','Tipo de Comunicação','Tribunal','Classe','Data de Disponibilização'].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
  <span role="status">1 - 3 / 9</span><button aria-label="Primeira página" disabled></button><button aria-label="anterior" disabled></button><button aria-label="próxima"></button><button aria-label="Última página"></button>`;
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  let page = 1;
  const render = () => {
    const tbody = document.querySelector('tbody'); const counter = document.querySelector('[role="status"]'); const next = document.querySelector<HTMLButtonElement>('[aria-label="próxima"]');
    if (!tbody || !counter || !next) throw Error('fixture');
    tbody.innerHTML = Array.from({ length: 3 }, () => `<tr><td>${cnj}</td><td>Público</td><td>Intimação</td><td>TJSP</td><td>Classe</td><td>06/10/2026</td><td><button>Peticionar</button><button>Visualizar Detalhes</button><button>Visualizar Documento</button></td></tr>`).join('');
    counter.textContent = `${(page - 1) * 3 + 1} - ${page * 3} / 9`; next.disabled = page === 3;
  };
  render();
  const forbidden = vi.fn();
  document.addEventListener('click', e => { if (/Peticionar|Visualizar|Domicílio/.test((e.target as HTMLElement).textContent || '')) forbidden(); }, { signal: controller.signal });
  const search = document.querySelector<HTMLButtonElement>('form button'); const next = document.querySelector<HTMLButtonElement>('[aria-label="próxima"]');
  if (!search || !next) throw Error('fixture');
  search.onclick = () => { page = 1; render(); }; next.onclick = () => { page++; render(); };
  const context = vm.createContext({ document, location: { pathname: '/central-comunicacoes' }, HTMLInputElement, Event, MutationObserver, getComputedStyle, Date, setTimeout, crypto });
  vm.runInContext(fs.readFileSync('extension/jusbr/core.js','utf8'), context);
  vm.runInContext(fs.readFileSync('extension/jusbr/dom.js','utf8'), context);
  return { dom: context.JusbrDom, core: context.JusbrCore, forbidden, next, search, render };
}
let controller = new AbortController();
afterEach(() => { controller.abort(); controller = new AbortController(); vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = ''; });
const setting = { oab_uf: 'SP', oab_number: '290702' };
const period = { start: '2026-10-01', end: '2026-10-08' };
describe('adaptador Diário com controles relatados', () => {
  it('pesquisa OAB UF+número e período, avança três páginas preservando três atos iguais, sem ações de linha', async () => {
    const { dom, core, forbidden } = fixture(); const emit = vi.fn(); const save = vi.fn();
    await core.collect(dom.create(setting, period), { run: crypto.randomUUID(), page: 1, seen: [], period }, save, emit);
    expect(emit.mock.calls.map(c => c[0].coverage.page)).toEqual([1,2,3]);
    expect(emit.mock.calls.map(c => c[0].rows.length)).toEqual([3,3,3]);
    expect(document.querySelectorAll('input')[1].value).toBe('SP290702');
    expect(document.querySelectorAll('input')[2].value).toBe('01/10/2026');
    expect(document.querySelectorAll('input')[3].value).toBe('08/10/2026');
    expect(forbidden).not.toHaveBeenCalled();
  });
  it('reconstrói filtros e chega à página de retomada pelo contador', async () => {
    const { dom } = fixture(); const adapter = dom.create(setting, period);
    await adapter.search({ page: 2 });
    const result = await adapter.read(); expect(result.start).toBe(4); expect(result.endIndex).toBe(6);
  });
  it('interrompe antes de Buscar se início/fim forem ambíguos', async () => {
    const { dom, search } = fixture(); const click = vi.spyOn(search, 'click');
    document.querySelectorAll('label')[2].firstChild?.replaceWith('Período');
    await expect(dom.create(setting, period).search({ page: 1 })).rejects.toThrow('ausente ou ambíguo');
    expect(click).not.toHaveBeenCalled();
  });
  it('não aceita vazio desconhecido e não seleciona Domicílio', () => {
    const { dom, forbidden } = fixture();
    const body = document.querySelector('tbody'); if (body) body.innerHTML = '';
    expect(() => dom.read()).toThrow('vazio NÃO confirmado');
    document.querySelector('[role="tab"]')?.setAttribute('aria-selected','false');
    expect(() => dom.scope()).toThrow('Domicílio nunca'); expect(forbidden).not.toHaveBeenCalled();
  });
  it('interrompe quando próxima não muda efetivamente a página', async () => {
    const { dom, next } = fixture(); next.onclick = () => {};
    vi.useFakeTimers();
    const rejected = expect(dom.create(setting, period).next()).rejects.toThrow('sem conclusão comprovada');
    await vi.advanceTimersByTimeAsync(21000); await rejected;
  });
  it('não reenvia ID imutável com dados diferentes após interrupção', async () => {
    const { core } = fixture(); const emit = vi.fn();
    await expect(core.collect({ verified: true, search: vi.fn(), read: async () => ({ rows: [{ cnj }], signature: 'changed', end: true }) }, { page: 1, run: 'r', seen: [], batchId: 'persisted', pendingSignature: 'original' }, vi.fn(), emit)).rejects.toThrow('Página mudou');
    expect(emit).not.toHaveBeenCalled();
  });
});
