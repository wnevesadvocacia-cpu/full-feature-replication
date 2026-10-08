const pending = new Map();
window.addEventListener('message', async event => {
  if (event.source !== window || event.origin !== location.origin) return;
  const m = event.data;
  if (['WNEVES_JUSBR_PAIR','WNEVES_JUSBR_RESTORE','WNEVES_JUSBR_SCAN_NOW'].includes(m?.type) && /^[0-9a-f-]{36}$/i.test(m.owner || '')) {
    try {
      const response = await chrome.runtime.sendMessage({ type: m.type.endsWith('SCAN_NOW') ? 'SCAN_NOW' : m.type.endsWith('RESTORE') ? 'RESTORE' : 'PAIR', owner: m.owner, settings: m.settings });
      window.postMessage({ type: m.type.endsWith('SCAN_NOW') ? 'WNEVES_JUSBR_SCAN_ACCEPTED' : 'WNEVES_JUSBR_PAIRED', ...response }, location.origin);
    } catch { window.postMessage({ type: 'WNEVES_JUSBR_PAIRED', ok: false }, location.origin); }
  }
  if (m?.type === 'WNEVES_JUSBR_RESULT' && pending.has(m.requestId)) {
    pending.get(m.requestId)({ ok: m.ok === true, persisted: m.persisted === true, done: m.done === true, message: String(m.message || '').slice(0, 1000) });
    pending.delete(m.requestId);
  }
});
chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m.type === 'PORTAL_STATUS') {
    window.postMessage({ type: 'WNEVES_JUSBR_STATUS', owner: m.owner, message: String(m.message || '').slice(0,1000) }, location.origin);
    reply({ ok: true }); return;
  }
  if (m.type !== 'CHECK_BATCH') return;
  const requestId = crypto.randomUUID();
  pending.set(requestId, reply);
  window.postMessage({ type: 'WNEVES_JUSBR_CHECK', requestId, owner: m.owner, batch: m.batch }, location.origin);
  setTimeout(() => {
    if (!pending.has(requestId)) return;
    pending.delete(requestId);
    reply({ ok: false, message: 'Servidor sem confirmação; lote preservado para retentativa.' });
  }, 30000);
  return true;
});
