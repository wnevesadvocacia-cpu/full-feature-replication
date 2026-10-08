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
  segments(period) {
    const result = []; const day = 86400000;
    for (let start = Date.parse(period.start); start <= Date.parse(period.end); start += 7 * day) {
      result.push({ start: new Date(start).toISOString().slice(0,10), end: new Date(Math.min(start + 6 * day, Date.parse(period.end))).toISOString().slice(0,10) });
    }
    return result;
  },
  split(period) {
    if (period.start === period.end) throw Error('Dia único truncado (100 primeiros); cobertura incompleta. Retomada e lotes preservados.');
    const middle = Date.parse(period.start) + Math.floor((Date.parse(period.end) - Date.parse(period.start)) / 86400000 / 2) * 86400000;
    return [{ start: period.start, end: new Date(middle).toISOString().slice(0,10) }, { start: new Date(middle + 86400000).toISOString().slice(0,10), end: period.end }];
  },
  async collectSegments(factory, checkpoint, save, emit, report = () => {}) {
    let state = { ...checkpoint };
    if (!state.segments) {
      // Legacy in-flight IDs cannot be repurposed for a different search.
      const legacy = !!state.batchId || state.page > 1;
      state = { ...state, segments: legacy ? [state.period] : this.segments(state.period), segmentIndex: 0, page: legacy ? state.page : 1, seen: legacy ? state.seen : [], finished: false };
      state.period = state.segments[0]; await save(state);
    }
    while (state.segmentIndex < state.segments.length) {
      if (state.segmentFinished) {
        const index = state.segmentIndex + 1;
        state = { ...state, segmentIndex: index, segmentFinished: false, finished: index === state.segments.length,
          run: crypto.randomUUID(), page: 1, seen: [], batchId: null, pendingSignature: null, period: state.segments[index] || state.period };
        await save(state);
        if (state.finished) return;
      }
      report(`Pesquisando ${state.period.start} a ${state.period.end}; segmento ${state.segmentIndex + 1}/${state.segments.length}, página ${state.page}.`);
      try {
        await this.collect(factory(state.period), state, async current => {
          state = { ...current, finished: false, segmentFinished: current.finished === true };
          await save(state);
        }, emit);
      } catch (error) {
        if (error.code !== 'TRUNCATED') throw error;
        if (state.batchId || state.page > 1) throw Error('Truncamento durante retomada; lotes preservados, cobertura incompleta.');
        const halves = this.split(state.period);
        const segments = [...state.segments]; segments.splice(state.segmentIndex, 1, ...halves);
        state = { ...state, segments, period: halves[0], page: 1, seen: [], segmentFinished: false };
        await save(state); report('Aviso dos 100 primeiros: reduzindo período; janela não certificada.');
      }
    }
  },
  async collect(adapter, checkpoint, save, emit) {
    if (!adapter.verified) throw Error('Pesquisa/paginação pendentes: controles autenticados sem evidência.');
    let state = checkpoint || { run: crypto.randomUUID(), page: 1, seen: [] };
    await adapter.search(state);
    while (state.page <= 1000) {
      const result = await adapter.read(state.page);
      if (!result || !Array.isArray(result.rows) || (!result.rows.length && result.empty !== true)) throw Error('Vazio sem confirmação ou estrutura desconhecida.');
      if (state.seen.includes(result.signature)) throw Error('Página repetida; cobertura interrompida.');
      // Save before emit; replay uses same batch ID if transport was interrupted.
      if (state.pendingSignature && state.pendingSignature !== result.signature) throw Error('Página mudou durante retomada; lote preservado, cobertura interrompida.');
      if (!state.batchId) { state = { ...state, batchId: crypto.randomUUID(), pendingSignature: result.signature }; await save(state); }
      await emit({ id: state.batchId, rows: result.rows, coverage: { run: state.run, page: state.page, kind: result.empty ? 'empty' : 'page', reason: 'Metadados; identidade integral pendente.' } });
      if (result.end === true) { await save({ ...state, finished: true }); return; }
      if (result.next !== true) throw Error('Fim/paginação não comprovados.');
      state = { ...state, page: state.page + 1, seen: [...state.seen, result.signature], batchId: null, pendingSignature: null };
      await save(state);
      await adapter.next();
    }
    throw Error('Limite de páginas; cobertura incompleta.');
  },
};
if (typeof globalThis !== 'undefined') globalThis.JusbrCore = JusbrCore;
