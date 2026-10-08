const appOrigins = new Set(['https://wnevesbox.com', 'https://www.wnevesbox.com', 'https://full-feature-replication.lovable.app', 'https://id-preview--b753a021-ff4f-4e59-b4fd-f9f912a4c7bf.lovable.app']);
const origin = sender => { try { return new URL(sender.url).origin; } catch { return ''; } };
async function status(message, error = true) {
  await chrome.storage.local.set({ message });
  await chrome.action.setBadgeText({ text: error ? '!' : 'OK' });
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    if (m.type === 'PAIR') {
      if (!appOrigins.has(origin(sender)) || !sender.tab || !/^[0-9a-f-]{36}$/i.test(m.owner || '')) throw Error('Vínculo inválido.');
      await chrome.storage.local.set({ owner: m.owner, tabId: sender.tab.id, origin: origin(sender), completedKey: null, busyUntil: 0 });
      await status('Vinculada. Leia os resultados do Diário da Justiça na Central. Cobertura limitada às linhas exibidas.', false);
      return { ok: true, owner: m.owner };
    }
    if (m.type !== 'JUSBR_VISIBLE' || origin(sender) !== 'https://portaldeservicos.pdpj.jus.br') throw Error('Origem inválida.');
    if (!Array.isArray(m.rows) || !m.rows.length || m.rows.length > 100) throw Error('Resultados inválidos.');
    const state = await chrome.storage.local.get(['owner', 'tabId', 'completedKey', 'busyUntil', 'origin']);
    if (!state.owner || !Number.isInteger(state.tabId)) throw Error('Abra Intimações no WnevesBox e clique em Vincular extensão.');
    const key = JSON.stringify([state.owner, m.rows]);
    if (state.completedKey === key) return { ok: true };
    if (state.busyUntil > Date.now()) throw Error('Conferência em andamento; novas linhas ainda não conferidas.');
    const tab = await chrome.tabs.get(state.tabId);
    if (!tab.url || new URL(tab.url).origin !== state.origin) throw Error('Reabra Intimações e vincule novamente.');
    await chrome.storage.local.set({ busyUntil: Date.now() + 11 * 60_000 });
    await status('Conferindo linhas visíveis. Não confirma cobertura integral.');
    try {
      const result = await chrome.tabs.sendMessage(state.tabId, { type: 'CHECK_VISIBLE', owner: state.owner, rows: m.rows });
      if (!result?.ok) throw Error(result?.message || 'Conferência incompleta.');
      await chrome.storage.local.set({ completedKey: key });
      await status(result.message, true); // Always alert: visible metadata is incomplete coverage.
      return { ok: true };
    } finally { await chrome.storage.local.set({ busyUntil: 0 }); }
  })().then(reply).catch(async e => { await status(e.message || 'Conferência incompleta.'); reply({ ok: false }); });
  return true;
});
