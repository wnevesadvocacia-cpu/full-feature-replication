const pending = new Map();
window.addEventListener('message', async event => {
  if (event.source !== window || event.origin !== location.origin) return;
  const m = event.data;
  if (m?.type === 'WNEVES_JUSBR_PAIR' && /^[0-9a-f-]{36}$/i.test(m.owner || '')) {
    const response = await chrome.runtime.sendMessage({ type: 'PAIR', owner: m.owner });
    window.postMessage({ type: 'WNEVES_JUSBR_PAIRED', ...response }, location.origin);
  }
  if (m?.type === 'WNEVES_JUSBR_RESULT' && pending.has(m.requestId)) {
    pending.get(m.requestId)({ ok: m.ok === true, message: String(m.message || '').slice(0, 400) });
    pending.delete(m.requestId);
  }
});
chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m.type !== 'CHECK_VISIBLE') return;
  const requestId = crypto.randomUUID();
  pending.set(requestId, reply);
  window.postMessage({ type: 'WNEVES_JUSBR_CHECK', requestId, owner: m.owner, rows: m.rows }, location.origin);
  setTimeout(() => {
    if (!pending.has(requestId)) return;
    pending.delete(requestId);
    reply({ ok: false, message: 'Conferência sem conclusão confirmada. Mantenha Intimações aberta e confira o portal.' });
  }, 11 * 60_000);
  return true;
});
