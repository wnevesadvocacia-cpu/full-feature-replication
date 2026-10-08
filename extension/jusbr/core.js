// Pure state machine; portal adapters must provide evidence-backed controls.
const JusbrCore = {
  window(lastEnd, now = Date.now()) {
    const start = lastEnd ? Math.max(Date.parse(lastEnd) - 7 * 86400000, now - 90 * 86400000) : now - 90 * 86400000;
    return { start: new Date(start).toISOString().slice(0, 10), end: new Date(now).toISOString().slice(0, 10) };
  },
  enqueue(state, owner, item) {
    if (state.owner !== owner) throw Error('Conta diferente.');
    if ((state.queue || []).some(q => q.id === item.id)) return state;
    if ((state.queue || []).length >= 200) throw Error('Fila cheia: cobertura interrompida.');
    return { ...state, queue: [...(state.queue || []), { ...item, owner, attempts: 0, retryAt: 0 }] };
  },
  acknowledge(state, owner, id) {
    if (state.owner !== owner) throw Error('Conta diferente.');
    return { ...state, queue: (state.queue || []).filter(q => q.id !== id) };
  },
  retry(item, now) { return { ...item, attempts: item.attempts + 1, retryAt: now + Math.min(60 * 60000, 60000 * 2 ** Math.min(item.attempts, 6)) }; },
  async collect(adapter, checkpoint, save, emit) {
    if (!adapter.verified) throw Error('Pesquisa/paginação pendentes: controles autenticados sem evidência.');
    let state = checkpoint || { run: crypto.randomUUID(), page: 1, seen: [] };
    await adapter.search(state);
    while (state.page <= 1000) {
      const result = await adapter.read(state.page);
      if (!result || !Array.isArray(result.rows) || (!result.rows.length && result.empty !== true)) throw Error('Vazio sem confirmação ou estrutura desconhecida.');
      if (state.seen.includes(result.signature)) throw Error('Página repetida; cobertura interrompida.');
      // Save before emit; replay uses same batch ID if transport was interrupted.
      if (!state.batchId) { state = { ...state, batchId: crypto.randomUUID() }; await save(state); }
      await emit({ id: state.batchId, rows: result.rows, coverage: { run: state.run, page: state.page, kind: result.empty ? 'empty' : 'page', reason: 'Metadados; identidade integral pendente.' } });
      if (result.end === true) { await save({ ...state, finished: true }); return; }
      if (result.next !== true) throw Error('Fim/paginação não comprovados.');
      state = { ...state, page: state.page + 1, seen: [...state.seen, result.signature], batchId: null };
      await save(state);
      await adapter.next();
    }
    throw Error('Limite de páginas; cobertura incompleta.');
  },
};
if (typeof globalThis !== 'undefined') globalThis.JusbrCore = JusbrCore;
