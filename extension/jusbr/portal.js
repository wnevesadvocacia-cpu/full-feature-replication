// Isolated world. Never read cookies, storage, passwords, network requests or detail links.
let timer;
let last = '';
function inspect() {
  if (location.pathname !== '/central-comunicacoes') return;
  const visible = el => !!(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const selected = tabs.find(el => el.getAttribute('aria-selected') === 'true');
  // Fail closed if the selected public Diario tab cannot be positively identified.
  if (!selected || !/di[aá]rio da justi[cç]a/i.test(selected.textContent || '')) return;
  const rows = [];
  for (const table of document.querySelectorAll('table,[role="table"]')) {
    if (!visible(table)) continue;
    const headers = [...table.querySelectorAll('th,[role="columnheader"]')].map(el => (el.textContent || '').trim());
    const cnjIndex = headers.findIndex(h => /^processo$/i.test(h));
    const dateIndex = headers.findIndex(h => /data de disponibiliza/i.test(h));
    const courtIndex = headers.findIndex(h => /^tribunal$/i.test(h));
    if (cnjIndex < 0 || dateIndex < 0 || courtIndex < 0) continue;
    for (const row of table.querySelectorAll('tr,[role="row"]')) {
      if (!visible(row)) continue;
      const cells = [...row.querySelectorAll('td,[role="cell"]')];
      const cnj = (cells[cnjIndex]?.textContent || '').replace(/\s/g, '').match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0];
      const date = (cells[dateIndex]?.textContent || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (cnj && date) rows.push({ cnj, date: `${date[3]}-${date[2]}-${date[1]}`, court: (cells[courtIndex]?.textContent || '').trim().slice(0, 80) });
    }
  }
  if (!rows.length || rows.length > 100) return;
  const key = JSON.stringify(rows);
  if (key === last) return;
  last = key;
  chrome.runtime.sendMessage({ type: 'JUSBR_VISIBLE', rows }).catch(() => { last = ''; });
}
new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(inspect, 1500); }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
setTimeout(inspect, 1500);
