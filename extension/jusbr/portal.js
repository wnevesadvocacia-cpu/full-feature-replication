// Isolated world: no portal cookies/storage/credentials, network interception or detail links.
let timer;
let last = '';
let scheduled = false;
const run = crypto.randomUUID();
let page = 0;
const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
function report(message) { return chrome.runtime.sendMessage({ type: 'PORTAL_STATUS', message }).catch(() => {}); }
async function inspect() {
  if (location.pathname !== '/central-comunicacoes') {
    if (scheduled) await report('Central não aberta ou sessão indisponível. Faça login e abra Minhas comunicações processuais; navegação automática não validada.');
    return;
  }
  const selected = [...document.querySelectorAll('[role="tab"]')].find(el => el.getAttribute('aria-selected') === 'true');
  if (!selected || !/di[aá]rio da justi[cç]a/i.test(selected.textContent || '')) {
    if (scheduled) await report('Diário não selecionado. Domicílio nunca é aberto pela extensão. Seleção automática pendente de validação.');
    return;
  }
  const rows = [];
  let recognized = false;
  let invalid = false;
  for (const table of document.querySelectorAll('table,[role="table"]')) {
    if (!visible(table)) continue;
    const headers = [...table.querySelectorAll('th,[role="columnheader"]')].map(el => (el.textContent || '').trim());
    const cnjIndex = headers.findIndex(h => /^processo$/i.test(h));
    const dateIndex = headers.findIndex(h => /data de disponibiliza/i.test(h));
    const courtIndex = headers.findIndex(h => /^tribunal$/i.test(h));
    if (cnjIndex < 0 || dateIndex < 0 || courtIndex < 0) continue;
    recognized = true;
    for (const row of table.querySelectorAll('tr,[role="row"]')) {
      if (!visible(row)) continue;
      const cells = [...row.querySelectorAll('td,[role="cell"]')];
      if (!cells.length) continue;
      const cnj = (cells[cnjIndex]?.textContent || '').replace(/\s/g, '').match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0];
      const date = (cells[dateIndex]?.textContent || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const court = (cells[courtIndex]?.textContent || '').trim();
      if (!cnj || !date || !court) { invalid = true; continue; }
      rows.push({ cnj, date: `${date[3]}-${date[2]}-${date[1]}`, court: court.slice(0, 80) });
    }
  }
  if (!recognized || invalid || rows.length > 100 || !rows.length) {
    await report(!recognized ? 'Estrutura desconhecida: coleta interrompida.' : invalid ? 'Linhas malformadas: cobertura incompleta.' : rows.length > 100 ? 'Limite de linhas: cobertura incompleta.' : 'Sem linhas. Resultado vazio NÃO confirmado; indicador de vazio ainda não validado.');
    return;
  }
  const key = JSON.stringify(rows);
  if (key === last && !scheduled) return;
  const batch = { id: crypto.randomUUID(), rows, coverage: { run, page: ++page, kind: 'visible', reason: 'Somente tela observada; pesquisa, número real da página, paginação e fim não validados.' } };
  const result = await chrome.runtime.sendMessage({ type: 'JUSBR_BATCH', batch }).catch(() => null);
  if (result?.ok) last = key;
  scheduled = false;
  await report('Linhas enfileiradas. Pesquisa/paginação interrompidas: faltam controles autenticados comprovados. Sessão não certificada; cobertura incompleta.');
}
chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m.type !== 'SCAN') return;
  scheduled = true;
  void inspect().then(() => reply({ ok: true, automatedSearch: false })).catch(e => { void report(e.message); reply({ ok: false }); });
  return true;
});
new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => { void inspect(); }, 1500); }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
setTimeout(() => { void inspect(); }, 1500);
