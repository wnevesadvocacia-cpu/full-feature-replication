// Public Diario only. No portal credentials, network requests or row actions.
let busy = false;
let timer;
const report = message => chrome.runtime.sendMessage({ type: 'PORTAL_STATUS', message }).catch(() => {});
async function scan(m) {
  if (busy) return { ok: false, message: 'Conferência já em andamento.' };
  busy = true;
  try {
    JusbrDom.scope();
    if (!m.owner || !Array.isArray(m.settings) || !m.settings.length) throw Error('Vínculo/OAB indisponível; abra Intimações.');
    for (const setting of m.settings) {
      const key = `${setting.oab_uf}${setting.oab_number}`;
      const response = await chrome.runtime.sendMessage({ type: 'CHECKPOINT_GET', owner: m.owner, key });
      if (!response?.ok) throw Error(response?.message || 'Retomada indisponível.');
      let state = response.checkpoint;
      if (!state || state.finished) state = { run: crypto.randomUUID(), page: 1, seen: [], period: m.window };
      const send = async payload => {
        const result = await chrome.runtime.sendMessage({ ...payload, owner: m.owner, key });
        if (!result?.ok) throw Error(result?.message || 'Fila/retomada não confirmada.');
      };
      await report(`Pesquisando Diário ${key}; retomada na página ${state.page}. Metadados não confirmam cobertura integral.`);
      await JusbrCore.collect(JusbrDom.create(setting, state.period), state,
        checkpoint => send({ type: 'CHECKPOINT_SAVE', checkpoint }),
        batch => send({ type: 'JUSBR_BATCH', batch }));
      await report(`Páginas do Diário ${key} percorridas; lotes aguardam confirmação DJEN. Cobertura de atos permanece incompleta.`);
    }
    return { ok: true, automatedSearch: true };
  } catch (e) { await report(`Conferência interrompida: ${e.message}`); return { ok: false, message: e.message }; }
  finally { busy = false; }
}
chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m.type !== 'SCAN') return;
  void scan(m).then(reply); return true;
});
// Ask the paired worker to start when the user opens/selects the public Diario.
function ready() {
  if (busy) return;
  try { JusbrDom.scope(); void chrome.runtime.sendMessage({ type: 'PORTAL_READY' }).catch(() => {}); } catch { /* Scheduled SCAN reports unavailable structures. */ }
}
new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(ready, 1500); }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
setTimeout(ready, 1500);
