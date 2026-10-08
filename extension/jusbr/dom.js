// Only controls reported from the public Diario form. No detail/document links.
const JusbrDom = (() => {
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const name = el => el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => text(document.getElementById(id))).join(' ').trim() || [...(el.labels || [])].map(text).join(' ') || text(el);
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const unique = (items, label) => { if (items.length !== 1) throw Error(`Controle ${label} ausente ou ambíguo; estrutura não validada.`); return items[0]; };
  function scope() {
    if (location.pathname !== '/central-comunicacoes') throw Error('Central/sessão indisponível. Faça login manualmente; sessão expirada não certificada.');
    const tabs = document.querySelector('#tabs_comunicacoes_processuais');
    if (!tabs) throw Error('Estrutura desconhecida: container de abas ausente.');
    const tab = unique([...tabs.querySelectorAll('[role="tab"]')].filter(el => visible(el) && /^Diário da Justiça$/i.test(name(el))), 'Diário da Justiça');
    if (tab.getAttribute('aria-selected') !== 'true') throw Error('Selecione Diário da Justiça manualmente. Domicílio nunca é aberto.');
    const form = document.querySelector('#form_busca_diario_justica');
    const table = document.querySelector('#diario_justica_tabela');
    if (!visible(form) || !visible(table)) throw Error('Formulário/tabela indisponíveis; sessão ou estrutura não verificada.');
    return { form, table };
  }
  function button(label, root = document) {
    return unique([...root.querySelectorAll('button,[role="button"]')].filter(el => visible(el) && name(el).toLocaleLowerCase('pt-BR') === label.toLocaleLowerCase('pt-BR')), label);
  }
  const disabled = el => el.disabled || el.getAttribute('aria-disabled') === 'true';
  function range() {
    scope();
    const candidates = [...document.querySelectorAll('#diario_justica_tabela *,[role="status"]')].filter(el => visible(el) && /^\d+\s*-\s*\d+\s*\/\s*\d+$/.test(text(el)) && ![...el.children].some(child => /^\d+\s*-\s*\d+\s*\/\s*\d+$/.test(text(child))));
    // No paginator CSS dependency: fall back to exact observed counter text.
    const nodes = candidates.length ? candidates : [...document.querySelectorAll('span,div,p')].filter(el => visible(el) && /^\d+\s*-\s*\d+\s*\/\s*\d+$/.test(text(el)) && ![...el.children].some(child => /^\d+\s*-\s*\d+\s*\/\s*\d+$/.test(text(child))));
    const counter = unique(nodes, 'contador do Diário');
    const numbers = text(counter).match(/\d+/g).map(Number);
    const [start, end, total] = numbers;
    if (!start || end < start || total < end) throw Error('Resultado vazio NÃO confirmado ou contador inválido.');
    const next = button('próxima');
    if ((end === total) !== !!disabled(next)) throw Error('Contador e próxima página inconsistentes; cobertura interrompida.');
    return { start, end, total, next };
  }
  function read() {
    const { table } = scope(); const r = range();
    const headers = [...table.querySelectorAll('th,[role="columnheader"]')].map(text);
    const indexes = ['Processo','Tribunal','Data de Disponibilização'].map(h => headers.findIndex(v => v.toLocaleLowerCase('pt-BR') === h.toLocaleLowerCase('pt-BR')));
    if (indexes.some(i => i < 0)) throw Error('Cabeçalhos desconhecidos; coleta interrompida.');
    const rows = [];
    for (const row of table.querySelectorAll('tr,[role="row"]')) {
      if (!visible(row)) continue;
      const cells = [...row.querySelectorAll('td,[role="cell"]')]; if (!cells.length) continue;
      const cnj = text(cells[indexes[0]]).replace(/\s/g, '').match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0];
      const date = text(cells[indexes[2]]).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const court = text(cells[indexes[1]]);
      if (!cnj || !date || !court || court.length > 80) throw Error('Linha malformada; cobertura incompleta.');
      rows.push({ cnj, date: `${date[3]}-${date[2]}-${date[1]}`, court });
    }
    if (rows.length !== r.end - r.start + 1 || rows.length > 100) throw Error('Contagem de linhas divergente ou vazio NÃO confirmado.');
    return { rows, signature: JSON.stringify([r.start,r.end,r.total,rows]), start: r.start, endIndex: r.end, total: r.total, next: r.end < r.total, end: r.end === r.total };
  }
  function input(form, label) { return unique([...form.querySelectorAll('input')].filter(el => visible(el) && label.test(name(el))), String(label)); }
  function setValue(el, value) {
    if (el.disabled || el.readOnly) throw Error('Campo indisponível; pesquisa interrompida.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw Error('Campo não suportado.');
    setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    if (el.value !== value || !el.checkValidity()) throw Error('Valor rejeitado no formulário.');
  }
  async function wait(action, accept, observeSearch = false) {
    const { table } = scope(); let changed = false;
    const observer = new MutationObserver(() => { changed = true; });
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    try {
      action(); const deadline = Date.now() + 20000; let stable = ''; let since = 0;
      while (Date.now() < deadline) {
        scope();
        try {
          const result = read();
          if ((!observeSearch || changed) && accept(result)) {
            if (stable !== result.signature) { stable = result.signature; since = Date.now(); }
            if (Date.now() - since >= 500) return result;
          } else stable = '';
        } catch (e) { if (/sessão|Estrutura|Selecione/.test(e.message)) throw e; stable = ''; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw Error('Busca/avanço sem conclusão comprovada em 20s; vazio não confirmado. Retomada preservada.');
    } finally { observer.disconnect(); }
  }
  function create(setting, period) {
    return {
      verified: true,
      async search(state) {
        const { form } = scope();
        const process = input(form, /^Número do Processo$/i);
        const oab = input(form, /^Número da OAB$/i);
        const start = input(form, /^(?:Período\s*[-–:]?\s*)?(?:início|data de início)$/i);
        const end = input(form, /^(?:Período\s*[-–:]?\s*)?(?:fim|data de fim)$/i);
        if (!/^[A-Z]{2}$/.test(setting.oab_uf) || !/^\d+$/.test(setting.oab_number)) throw Error('OAB/UF inválidas.');
        const format = (el, date) => el.type === 'date' ? date : date.split('-').reverse().join('/');
        setValue(process, ''); setValue(oab, setting.oab_uf + setting.oab_number);
        setValue(start, format(start, period.start)); setValue(end, format(end, period.end));
        const search = button('Buscar', form); if (disabled(search)) throw Error('Buscar indisponível.');
        await wait(() => search.click(), result => result.start === 1, true);
        for (let page = 1; page < state.page; page++) await this.next();
      },
      async read() { return read(); },
      async next() {
        const before = read(); const next = range().next;
        if (disabled(next)) throw Error('Próxima desabilitada antes do avanço esperado.');
        await wait(() => next.click(), result => result.start === before.endIndex + 1 && result.total === before.total);
      },
    };
  }
  return { create, read, scope };
})();
globalThis.JusbrDom = JusbrDom;
