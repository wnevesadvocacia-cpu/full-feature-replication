importScripts("core.js");
const appOrigins = new Set([
  "https://wnevesbox.com",
  "https://www.wnevesbox.com",
  "https://full-feature-replication.lovable.app",
  "https://id-preview--b753a021-ff4f-4e59-b4fd-f9f912a4c7bf.lovable.app",
]);
const origin = (sender) => {
  try {
    return new URL(sender.url).origin;
  } catch {
    return "";
  }
};
let processing = false;
let scanTask = null;
let collectorTabId = null;
let collectorProgressAt = 0;
let rescanRequested = false;
let serial = Promise.resolve();
function exclusive(fn) {
  const task = serial.then(fn);
  serial = task.catch(() => {});
  return task;
}
async function status(message) {
  const version = chrome.runtime.getManifest?.().version;
  if (version && !/^\[v[^\]]+\]/.test(message)) message = `[v${version}] ${message}`;
  const state = await chrome.storage.local.get(["owner", "tabId", "origin"]);
  await chrome.storage.local.set({ message, messageOwner: state.owner });
  if (state.owner && state.tabId && appOrigins.has(state.origin)) {
    const tab = await chrome.tabs.get(state.tabId).catch(() => null);
    if (tab?.url && new URL(tab.url).origin === state.origin)
      await chrome.tabs
        .sendMessage(state.tabId, { type: "PORTAL_STATUS", owner: state.owner, message })
        .catch(() => {});
  }
  await chrome.action.setBadgeText({ text: "!" });
}
async function pump() {
  if (processing) return;
  processing = true;
  try {
    const state = await chrome.storage.local.get(["owner", "tabId", "queue", "origin"]);
    const item = state.queue?.find((q) => q.owner === state.owner && q.retryAt <= Date.now());
    if (!item) return;
    try {
      const tab = await chrome.tabs.get(state.tabId);
      if (!tab.url || new URL(tab.url).origin !== state.origin)
        throw Error("Abra Intimações na conta vinculada para retomar.");
      const result = await chrome.tabs.sendMessage(state.tabId, {
        type: "CHECK_BATCH",
        owner: state.owner,
        batch: item,
      });
      if (!result?.ok || !result.persisted) throw Error(result?.message || "Lote sem confirmação do servidor.");
      // The server's durable queue now owns delivery after persistence, independently of import completion.
      if (result.persisted) {
        await exclusive(async () => {
          const latest = await chrome.storage.local.get(["owner", "queue"]);
          if (latest.owner !== item.owner) return;
          await chrome.storage.local.set(JusbrCore.acknowledge(latest, item.owner, item.id));
        });
        await status(result.message);
      } else {
        await exclusive(async () => {
          const latest = await chrome.storage.local.get(["owner", "queue"]);
          if (latest.owner !== item.owner) return;
          await chrome.storage.local.set({
            queue: (latest.queue || []).map((q) => (q.id === item.id ? { ...q, retryAt: Date.now() + 60000 } : q)),
          });
        });
        await status(result.message);
      }
    } catch (e) {
      await exclusive(async () => {
        const latest = await chrome.storage.local.get(["owner", "queue"]);
        if (latest.owner !== item.owner) return;
        await chrome.storage.local.set({
          queue: (latest.queue || []).map((q) => (q.id === item.id ? JusbrCore.retry(q, Date.now()) : q)),
        });
      });
      await status(`${e.message} Retentativa automática; importações preservadas.`);
    }
  } finally {
    processing = false;
    const state = await chrome.storage.local.get(["queue", "scanPaused"]);
    if (state.queue?.length) {
      await chrome.alarms.create("retry", {
        when: Math.max(Date.now() + 30000, Math.min(...state.queue.map((q) => q.retryAt || 0))),
      });
      if (state.queue.some((q) => q.retryAt <= Date.now()))
        setTimeout(() => {
          void pump();
        }, 1000);
    } else await chrome.alarms.clear("retry");
    if (state.scanPaused && (state.queue?.length || 0) < 100) {
      await chrome.storage.local.set({ scanPaused: false });
      setTimeout(() => {
        void scan();
      }, 1500);
    }
  }
}
function scan() {
  if (scanTask) return scanTask;
  scanTask = performScan().finally(() => {
    scanTask = null;
    if (rescanRequested) {
      rescanRequested = false;
      setTimeout(() => { void scan(); }, 0);
    }
  });
  return scanTask;
}
function requestScan(tabId, payload) {
  collectorTabId = tabId;
  collectorProgressAt = Date.now();
  return new Promise((resolve, reject) => {
    let timer;
    let done = false;
    const settle = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      collectorTabId = null;
      fn(value);
    };
    const check = () => {
      const remaining = 150000 - (Date.now() - collectorProgressAt);
      if (remaining <= 0) {
        settle(reject, Error('Portal sem progresso em 150s; tentativa encerrada, fila e retomada preservadas.'));
      } else timer = setTimeout(check, remaining);
    };
    timer = setTimeout(check, 150000);
    Promise.resolve().then(() => chrome.tabs.sendMessage(tabId, payload))
      .then(value => settle(resolve, value), error => settle(reject, error));
  });
}
function requireCollector(tabId) {
  if (tabId === collectorTabId) return;
  const error = Error('Coletor anterior encerrado; retomada preservada.');
  error.code = 'STALE_COLLECTOR';
  throw error;
}
async function performScan() {
  const state = await chrome.storage.local.get(["owner", "settings", "lastReadEnd", "queue", "portalTabId"]);
  if (!state.owner) return;
  if ((state.queue?.length || 0) >= 100) {
    await chrome.storage.local.set({ scanPaused: true });
    return status("Conferência aguardando envio dos lotes já lidos; retomada automática após transferência.");
  }
  const tabs = await chrome.tabs.query({ url: "https://portaldeservicos.pdpj.jus.br/*" });
  if (!tabs.length) return status("Jus.br não está aberto. Faça login no portal; credenciais nunca são capturadas.");
  const isCentral = (tab) => {
    try {
      return new URL(tab.url).pathname === "/central-comunicacoes";
    } catch {
      return false;
    }
  };
  // Only collect from the exact public tab whose content script declared READY.
  // active is true in each Chrome window and cannot identify the right tab.
  const tab = tabs.find((tab) => tab.id === state.portalTabId && isCentral(tab));
  if (!tab) {
    if (tabs.some(isCentral))
      return status('Aguardando o Diário da Justiça informar que está pronto. Recarregue a aba que deseja conferir.');
    const home = tabs.find((tab) => {
      try {
        return new URL(tab.url).pathname === "/home";
      } catch {
        return false;
      }
    });
    if (!home)
      return status(
        "Abra a Central de Comunicações no Jus.br e selecione Diário da Justiça. Login não verificado nesta página.",
      );
    const navigation = await chrome.storage.local.get("lastPortalNavigation");
    if (navigation.lastPortalNavigation && Date.now() - navigation.lastPortalNavigation < 60000)
      return status("Aguardando a Central de Comunicações carregar. Se o portal pedir login, entre nele.");
    await chrome.storage.local.set({ lastPortalNavigation: Date.now(), lastScanAt: 0 });
    await chrome.tabs.update(home.id, { url: "https://portaldeservicos.pdpj.jus.br/central-comunicacoes" });
    return status("Diário da Justiça aberto; aguardando o carregamento para iniciar a conferência.");
  }
  {
    try {
      const result = await requestScan(tab.id, {
        type: "SCAN",
        owner: state.owner,
        window: JusbrCore.window(state.lastReadEnd),
        settings: state.settings,
      });
      if (result?.inProgress && result.owner === state.owner && result.message) await status(result.message);
    } catch (error) {
      if (/Portal sem progresso/.test(error.message)) await status(error.message);
      else await status('Recarregue a aba do Diário selecionada. Conexão com a extensão não confirmada; retomada preservada.');
    } finally {
      const current = await chrome.storage.local.get(['owner', 'collectorLease']);
      if (current.owner === state.owner && current.collectorLease?.tabId === tab.id)
        await chrome.storage.local.set({ collectorLease: null });
    }
  }
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  exclusive(async () => {
    if (["PAIR", "RESTORE", "SCAN_NOW"].includes(m.type)) {
      if (!appOrigins.has(origin(sender)) || !sender.tab || !/^[0-9a-f-]{36}$/i.test(m.owner || ""))
        throw Error("Vínculo inválido.");
      const state = await chrome.storage.local.get(["owner", "queue"]);
      if (["RESTORE", "SCAN_NOW"].includes(m.type) && state.owner !== m.owner)
        return { ok: false, message: "Vincule a conta antes de conferir." };
      if (m.type === "SCAN_NOW") {
        await chrome.storage.local.set({
          tabId: sender.tab.id,
          origin: origin(sender),
          queue: (state.queue || []).map((q) => (q.owner === m.owner ? { ...q, retryAt: 0 } : q)),
        });
        return { ok: true, owner: m.owner };
      }
      if (state.owner && state.owner !== m.owner && state.queue?.length)
        throw Error("Há lotes da conta anterior. Retome nessa conta antes de trocar o vínculo.");
      await chrome.storage.local.set({
        owner: m.owner,
        tabId: sender.tab.id,
        origin: origin(sender),
        settings: m.settings,
        ...(state.owner !== m.owner
          ? { queue: [], checkpoints: {}, lastCompleteEnd: null, lastReadEnd: null, scanPaused: false, portalTabId: null }
          : {}),
      });
      await chrome.alarms.create("scan", { periodInMinutes: 60 });
      await status(
        "Vínculo persistido. Busca segmentada com ciclo de carregamento; cobertura e importação ponta a ponta ainda incompletas.",
      );
      return { ok: true, owner: m.owner };
    }
    if (origin(sender) !== "https://portaldeservicos.pdpj.jus.br") throw Error("Origem inválida.");
    if (m.type === "PORTAL_READY") {
      if (!sender.tab || new URL(sender.url).pathname !== '/central-comunicacoes') throw Error('Aba do Diário não validada.');
      const state = await chrome.storage.local.get(["owner", "settings", "lastCompleteEnd", "lastScanAt"]);
      if (state.owner) {
        if (collectorTabId !== null && collectorTabId !== sender.tab.id) rescanRequested = true;
        await chrome.storage.local.set({ lastScanAt: Date.now(), portalTabId: sender.tab.id });
        void scan();
      }
      return { ok: true };
    }
    if (["CHECKPOINT_GET", "CHECKPOINT_SAVE", "JUSBR_BATCH"].includes(m.type)) {
      const state = await chrome.storage.local.get(["owner", "checkpoints", "settings", "collectorLease"]);
      if (
        !state.owner ||
        m.owner !== state.owner ||
        !state.settings?.some((s) => `${s.oab_uf}${s.oab_number}` === m.key)
      )
        throw Error("Conta/OAB alterada; coleta interrompida.");
      if (!sender.tab) throw Error("Aba indisponível.");
      requireCollector(sender.tab.id);
      collectorProgressAt = Date.now();
      if (state.collectorLease?.until > Date.now() && state.collectorLease.tabId !== sender.tab.id)
        throw Error("Outra aba do Diário está coletando.");
      await chrome.storage.local.set({ collectorLease: { tabId: sender.tab.id, until: Date.now() + 150000 } });
      if (m.type === "CHECKPOINT_GET") return { ok: true, checkpoint: state.checkpoints?.[m.key] || null };
      if (m.type === "CHECKPOINT_SAVE") {
        const checkpoint = m.checkpoint;
        if (
          !checkpoint ||
          !Number.isInteger(checkpoint.page) ||
          checkpoint.page < 1 ||
          checkpoint.page > 1000 ||
          !Array.isArray(checkpoint.seen) ||
          !checkpoint.period
        )
          throw Error("Checkpoint inválido.");
        const checkpoints = { ...(state.checkpoints || {}), [m.key]: checkpoint };
        const lastReadEnd = JusbrCore.readEnd(checkpoints, state.settings);
        await chrome.storage.local.set({ checkpoints, ...(lastReadEnd ? { lastReadEnd } : {}) });
        return { ok: true };
      }
    }
    if (m.type === "PORTAL_STATUS") {
      const state = await chrome.storage.local.get("owner");
      if (!state.owner || m.owner !== state.owner) throw Error("Conta alterada; status descartado.");
      requireCollector(sender.tab?.id);
      collectorProgressAt = Date.now();
      await status(String(m.message || "Estrutura desconhecida.").slice(0, 400));
      return { ok: true };
    }
    if (m.type !== "JUSBR_BATCH" || !Array.isArray(m.batch?.rows) || m.batch.rows.length > 100)
      throw Error("Lote inválido.");
    const state = await chrome.storage.local.get(["owner", "queue"]);
    if (!state.owner) throw Error("Vincule a extensão no WnevesBox uma vez.");
    if ((state.queue?.length || 0) >= 180) {
      await chrome.storage.local.set({ scanPaused: true });
      throw Error("Envio pendente; página preservada para retomada automática.");
    }
    await chrome.storage.local.set(JusbrCore.enqueue(state, state.owner, m.batch));
    await chrome.alarms.create("retry", { delayInMinutes: 1 });
    return { ok: true, queued: true };
  })
    .then((result) => {
      reply(result);
      void pump();
      if (["PAIR", "RESTORE", "SCAN_NOW"].includes(m.type) && result.ok) void scan();
    })
    .catch(async (e) => {
      if (e.code !== 'STALE_COLLECTOR') await status(e.message);
      reply({ ok: false, message: e.message });
    });
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "retry") void pump();
  if (alarm.name === "scan") void scan();
});
chrome.runtime.onStartup.addListener(() => {
  void pump();
  void scan();
});
