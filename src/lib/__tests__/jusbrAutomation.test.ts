import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import {
  validateObservations,
  validCoverage,
  ownerMatches,
  targetedNumbers,
} from "../../../supabase/functions/_shared/jusbrBatch";
const row = { cnj: "1003778-63.2024.8.26.0084", date: "2026-10-06", court: "TJSP" };
const owner = "00000000-0000-4000-8000-000000000001";
function core() {
  const context = vm.createContext({
    crypto: { randomUUID: vi.fn().mockReturnValueOnce("batch-1").mockReturnValue("batch-2") },
    Date,
  });
  vm.runInContext(fs.readFileSync("extension/jusbr/core.js", "utf8"), context);
  return context.JusbrCore;
}
describe("Jus.br automação segura", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T16:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  it("aceita o dia inteiro no limite inicial de 90 dias, mas rejeita o dia anterior", () => {
    expect(validateObservations([{ ...row, date: "2026-07-10" }])).toHaveLength(1);
    expect(() => validateObservations([{ ...row, date: "2026-07-09" }])).toThrow("90 dias");
  });
  it("avança a janela de leitura somente depois de todas as OABs terminarem", () => {
    const c = core();
    const settings = [
      { oab_uf: "SP", oab_number: "1" },
      { oab_uf: "MG", oab_number: "2" },
    ];
    const checkpoints = {
      SP1: { finished: true, period: { end: "2026-10-08" } },
      MG2: { finished: false, period: { end: "2026-10-07" } },
    };
    expect(c.readEnd(checkpoints, settings)).toBeNull();
    checkpoints.MG2.finished = true;
    expect(c.readEnd(checkpoints, settings)).toBe("2026-10-07");
    expect(c.readEnd(checkpoints, [])).toBeNull();
  });
  it("transfere um lote gravado para a fila do servidor sem declarar importação concluída", async () => {
    const state: any = {
      owner,
      tabId: 1,
      origin: "https://wnevesbox.com",
      queue: [{ id: "batch-1", owner, attempts: 0, retryAt: 0 }],
    };
    const response = { ok: true, persisted: true, done: false, message: "Aguardando vez na fila DJEN." };
    const storage = {
      get: vi.fn(async () => ({ ...state, queue: [...state.queue] })),
      set: vi.fn(async (update: any) => Object.assign(state, update)),
    };
    const context = vm.createContext({
      Date,
      Promise,
      URL,
      setTimeout: vi.fn(),
      importScripts: () => {},
      JusbrCore: core(),
      chrome: {
        storage: { local: storage },
        tabs: {
          get: async () => ({ url: "https://wnevesbox.com/#/intimacoes" }),
          sendMessage: async (_id: number, m: any) => (m.type === "CHECK_BATCH" ? response : {}),
        },
        action: { setBadgeText: vi.fn() },
        alarms: { create: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn() } },
        runtime: { onMessage: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() } },
      },
    });
    vm.runInContext(fs.readFileSync("extension/jusbr/background.js", "utf8"), context);
    await context.pump();
    expect(state.queue).toHaveLength(0);
    expect(response.done).toBe(false);
    state.queue = [{ id: "batch-2", owner, attempts: 0, retryAt: 0 }];
    response.persisted = false;
    await context.pump();
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].attempts).toBe(1);
  });
  it("pagina três páginas e preserva dois atos com os mesmos metadados", async () => {
    const c = core();
    const emit = vi.fn();
    const save = vi.fn();
    const next = vi.fn();
    const read = vi.fn(async (page: number) => ({
      rows: page === 1 ? [row, row] : [row],
      signature: String(page),
      next: page < 3,
      end: page === 3,
    }));
    await c.collect({ verified: true, search: vi.fn(), read, next }, { run: owner, page: 1, seen: [] }, save, emit);
    expect(read.mock.calls.map((args) => args[0])).toEqual([1, 2, 3]);
    expect(next).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][0].rows).toHaveLength(2);
    expect(save.mock.calls.at(-1)?.[0].finished).toBe(true);
  });
  it("retoma transporte interrompido com mesmo lote e mesma página", async () => {
    const c = core();
    let checkpoint: any;
    const save = vi.fn(async (state: any) => {
      checkpoint = state;
    });
    const adapter = {
      verified: true,
      search: vi.fn(),
      read: vi.fn(async () => ({ rows: [row], signature: "1", end: true })),
    };
    const failed = vi.fn(async () => {
      throw Error("offline");
    });
    await expect(c.collect(adapter, { run: owner, page: 1, seen: [] }, save, failed)).rejects.toThrow("offline");
    const sentId = checkpoint.batchId;
    const retry = vi.fn();
    await c.collect(adapter, checkpoint, save, retry);
    expect(retry.mock.calls[0][0].id).toBe(sentId);
    expect(retry.mock.calls[0][0].coverage.page).toBe(1);
  });
  it("retoma na próxima página após interrupção de navegação", async () => {
    const c = core();
    let checkpoint: any;
    const save = async (state: any) => {
      checkpoint = state;
    };
    const adapter = {
      verified: true,
      search: vi.fn(),
      read: vi.fn(async () => ({ rows: [row], signature: "1", next: true })),
      next: vi.fn(async () => {
        throw Error("interrompido");
      }),
    };
    await expect(c.collect(adapter, { run: owner, page: 1, seen: [] }, save, vi.fn())).rejects.toThrow("interrompido");
    expect(checkpoint.page).toBe(2);
    const search = vi.fn();
    const emit = vi.fn();
    await c.collect(
      { verified: true, search, read: vi.fn(async () => ({ rows: [row], signature: "2", end: true })) },
      checkpoint,
      save,
      emit,
    );
    expect(search.mock.calls[0][0].page).toBe(2);
    expect(emit.mock.calls[0][0].coverage.page).toBe(2);
  });
  it("não aceita vazio sem evidência; aceita vazio explícito apenas no adaptador verificado", async () => {
    const c = core();
    const emit = vi.fn();
    await expect(
      c.collect(
        { verified: true, search: vi.fn(), read: async () => ({ rows: [], end: true }) },
        { run: owner, page: 1, seen: [] },
        vi.fn(),
        emit,
      ),
    ).rejects.toThrow("Vazio");
    expect(emit).not.toHaveBeenCalled();
    await c.collect(
      { verified: true, search: vi.fn(), read: async () => ({ rows: [], empty: true, end: true, signature: "empty" }) },
      { run: owner, page: 1, seen: [] },
      vi.fn(),
      emit,
    );
    expect(emit.mock.calls[0][0].coverage.kind).toBe("empty");
  });
  it("bloqueia controles não verificados e páginas repetidas", async () => {
    const c = core();
    const search = vi.fn();
    await expect(c.collect({ verified: false, search }, null, vi.fn(), vi.fn())).rejects.toThrow("sem evidência");
    expect(search).not.toHaveBeenCalled();
    await expect(
      c.collect(
        { verified: true, search, read: async () => ({ rows: [row], signature: "same", next: true }), next: vi.fn() },
        { run: owner, page: 1, seen: [] },
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toThrow("Página repetida");
  });
  it("deduplica replay de lote sem bloquear páginas diferentes; isola contas", () => {
    const c = core();
    let state = c.enqueue({ owner, queue: [] }, owner, { id: "1", rows: [row] });
    state = c.enqueue(state, owner, { id: "1", rows: [row] });
    state = c.enqueue(state, owner, { id: "2", rows: [row] });
    expect(state.queue).toHaveLength(2);
    expect(() => c.enqueue(state, "other", { id: "3" })).toThrow("Conta diferente");
    expect(() => c.acknowledge(state, "other", "1")).toThrow("Conta diferente");
    expect(c.acknowledge(state, owner, "1").queue[0].id).toBe("2");
    expect(ownerMatches({ user_id: owner }, "other")).toBe(false);
  });
  it("retentativa progressiva e janela incremental com sobreposição", () => {
    const c = core();
    expect(c.retry({ attempts: 0 }, 0).retryAt).toBe(60000);
    expect(c.retry({ attempts: 6 }, 0).retryAt).toBe(3600000);
    expect(c.window("2026-10-07").start).toBe("2026-09-30");
    expect(c.window(null).start).toBe("2026-07-10");
  });
  it("divide janela de 90 dias em segmentos de no máximo sete dias sem lacunas", () => {
    const c = core();
    const periods = c.segments(c.window(null));
    expect(periods[0].start).toBe("2026-07-10");
    expect(periods.at(-1).end).toBe("2026-10-08");
    expect(periods).toHaveLength(13);
    periods.forEach((p: any, i: number) => {
      expect((Date.parse(p.end) - Date.parse(p.start)) / 86400000).toBeLessThanOrEqual(6);
      if (i) expect(Date.parse(p.start) - Date.parse(periods[i - 1].end)).toBe(86400000);
    });
  });
  it("subdivide truncamento recursivamente e nunca emite dados truncados", async () => {
    const c = core();
    const emit = vi.fn();
    let saved: any;
    const factory = (p: any) => ({
      verified: true,
      search: async () => {
        if (p.start !== p.end) throw Object.assign(Error("100"), { code: "TRUNCATED" });
      },
      read: async () => ({ rows: [row], signature: p.start, end: true }),
    });
    await c.collectSegments(
      factory,
      { run: owner, period: { start: "2026-10-01", end: "2026-10-07" }, page: 1, seen: [] },
      async (s: any) => {
        saved = s;
      },
      emit,
    );
    expect(emit).toHaveBeenCalledTimes(7);
    expect(saved.finished).toBe(true);
    expect(saved.segments).toHaveLength(7);
  });
  it("dia único truncado preserva checkpoint sem concluir nem emitir lote", async () => {
    const c = core();
    const emit = vi.fn();
    let saved: any;
    const factory = () => ({
      verified: true,
      search: async () => {
        throw Object.assign(Error("100"), { code: "TRUNCATED" });
      },
    });
    await expect(
      c.collectSegments(
        factory,
        { run: owner, period: { start: "2026-10-08", end: "2026-10-08" }, page: 1, seen: [] },
        async (s: any) => {
          saved = s;
        },
        emit,
      ),
    ).rejects.toThrow("Dia único truncado");
    expect(saved.finished).toBe(false);
    expect(saved.period.start).toBe("2026-10-08");
    expect(emit).not.toHaveBeenCalled();
  });
  it("retoma segmento com ID imutável após falha e não repete segmento anterior", async () => {
    const c = core();
    let saved: any;
    let fail = true;
    const factory = (p: any) => ({
      verified: true,
      search: vi.fn(),
      read: async () => ({ rows: [row], signature: p.start, end: true }),
    });
    const initial = { run: owner, period: { start: "2026-10-01", end: "2026-10-08" }, page: 1, seen: [] };
    const emit = vi.fn(async () => {
      if (emit.mock.calls.length === 2 && fail) throw Error("offline");
    });
    const save = async (s: any) => {
      saved = s;
    };
    await expect(c.collectSegments(factory, initial, save, emit)).rejects.toThrow("offline");
    expect(saved.segmentIndex).toBe(1);
    const id = saved.batchId;
    fail = false;
    const retry = vi.fn();
    await c.collectSegments(factory, saved, save, retry);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][0].id).toBe(id);
    expect(saved.finished).toBe(true);
  });
  it("preserva retomada 0.3.2 sem reutilizar ID em período dividido", async () => {
    const c = core();
    const emit = vi.fn();
    const search = vi.fn();
    let saved: any;
    const period = { start: "2026-07-10", end: "2026-10-08" };
    const checkpoint = { run: owner, period, page: 2, seen: ["1"], batchId: "legacy", pendingSignature: "2" };
    const factory = vi.fn((_period: typeof period) => ({
      verified: true,
      search,
      read: async () => ({ rows: [row], signature: "2", end: true }),
    }));
    await c.collectSegments(
      factory,
      checkpoint,
      async (s: any) => {
        saved = s;
      },
      emit,
    );
    expect(factory.mock.calls[0][0]).toEqual(period);
    expect(search.mock.calls[0][0].page).toBe(2);
    expect(emit.mock.calls[0][0].id).toBe("legacy");
    expect(saved.finished).toBe(true);
    const truncated = () => ({
      verified: true,
      search: async () => {
        throw Object.assign(Error("100"), { code: "TRUNCATED" });
      },
    });
    await expect(
      c.collectSegments(
        truncated,
        checkpoint,
        async (s: any) => {
          saved = s;
        },
        vi.fn(),
      ),
    ).rejects.toThrow("Truncamento durante retomada");
    expect(saved.batchId).toBe("legacy");
    expect(saved.finished).toBe(false);
  });
  it("servidor preserva ocorrências, direciona CNJs únicos e rejeita datas/vazio sem evidência", () => {
    const rows = validateObservations([row, row]);
    expect(rows).toHaveLength(2);
    expect(rows[0].occurrence).not.toBe(rows[1].occurrence);
    expect(targetedNumbers(rows)).toEqual([row.cnj]);
    expect(() => validateObservations([{ ...row, date: "2026-02-30" }])).toThrow();
    expect(() => validCoverage({ run: owner, page: 1, kind: "visible" }, [])).toThrow("Vazio");
    expect(validCoverage({ run: owner, page: 1, kind: "empty" }, []).complete).toBe(false);
  });

  it("limita espera interna, libera a coleta e ignora resposta atrasada", async () => {
    let finishCheckpoint: any;
    const collector = vi.fn();
    const messages: any[] = [];
    const sendMessage = vi.fn((m: any) => {
      messages.push(m);
      return m.type === "CHECKPOINT_GET"
        ? new Promise((resolve) => {
            finishCheckpoint = resolve;
          })
        : Promise.resolve({ ok: true });
    });
    const context = vm.createContext({
      Date,
      Promise,
      setTimeout,
      clearTimeout,
      crypto: { randomUUID: () => owner },
      document: { documentElement: {} },
      MutationObserver: class {
        observe() {}
      },
      JusbrDom: { scope: vi.fn(), create: vi.fn() },
      JusbrCore: { collectSegments: collector },
      chrome: { runtime: { sendMessage, onMessage: { addListener: vi.fn() } } },
    });
    vm.runInContext(fs.readFileSync("extension/jusbr/portal.js", "utf8"), context);
    const settings = [{ oab_uf: "SP", oab_number: "1" }];
    const first = context.scan({ owner, settings });
    await vi.advanceTimersByTimeAsync(1);
    const reports = messages.filter((m) => m.type === "PORTAL_STATUS").length;
    const duplicate = await context.scan({ owner, settings });
    expect(duplicate.inProgress).toBe(true);
    expect(messages.filter((m) => m.type === "PORTAL_STATUS")).toHaveLength(reports);
    await vi.advanceTimersByTimeAsync(15000);
    expect((await first).ok).toBe(false);
    finishCheckpoint({ ok: true, checkpoint: null });
    await Promise.resolve();
    expect(collector).not.toHaveBeenCalled();
    sendMessage.mockImplementation(async () => ({ ok: true, checkpoint: null }));
    expect((await context.scan({ owner, settings })).ok).toBe(true);
    expect(collector).toHaveBeenCalledOnce();
  });
  it("compartilha uma busca em curso sem disparar outro coletor", async () => {
    let finishScan: any;
    const state = { owner, settings: [], queue: [] };
    const query = vi.fn(async () => [{ id: 7, url: "https://portaldeservicos.pdpj.jus.br/central-comunicacoes" }]);
    const sendMessage = vi.fn(
      () =>
        new Promise((resolve) => {
          finishScan = resolve;
        }),
    );
    const context = vm.createContext({
      Date,
      Promise,
      URL,
      setTimeout,
      importScripts: () => {},
      JusbrCore: core(),
      chrome: {
        storage: { local: { get: async () => state, set: vi.fn() } },
        tabs: { query, sendMessage },
        action: { setBadgeText: vi.fn() },
        alarms: { onAlarm: { addListener: vi.fn() } },
        runtime: { onMessage: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() } },
      },
    });
    vm.runInContext(fs.readFileSync("extension/jusbr/background.js", "utf8"), context);
    const first = context.scan();
    const duplicate = context.scan();
    expect(duplicate).toBe(first);
    await vi.advanceTimersByTimeAsync(1);
    expect(query).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledOnce();
    finishScan({ ok: true });
    await first;
    const next = context.scan();
    await vi.advanceTimersByTimeAsync(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    finishScan({ ok: true });
    await next;
  });

  it("prioriza a Central sobre a aba inicial e abre a Central quando só há home", async () => {
    const state: any = { owner, settings: [], queue: [], tabId: 1, origin: "https://wnevesbox.com" };
    const tabs: any[] = [
      { id: 7, url: "https://portaldeservicos.pdpj.jus.br/home" },
      { id: 8, url: "https://portaldeservicos.pdpj.jus.br/central-comunicacoes" },
    ];
    const sendMessage = vi.fn(async () => ({ ok: true }));
    const update = vi.fn(async () => ({}));
    const context = vm.createContext({
      Date,
      Promise,
      URL,
      setTimeout,
      importScripts: () => {},
      JusbrCore: core(),
      chrome: {
        storage: { local: { get: async () => ({ ...state }), set: async (v: any) => Object.assign(state, v) } },
        tabs: { query: async () => tabs, get: async () => ({ url: state.origin }), sendMessage, update },
        action: { setBadgeText: vi.fn() },
        alarms: { onAlarm: { addListener: vi.fn() } },
        runtime: { onMessage: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() } },
      },
    });
    vm.runInContext(fs.readFileSync("extension/jusbr/background.js", "utf8"), context);
    await context.scan();
    expect(sendMessage).toHaveBeenCalledWith(8, expect.objectContaining({ type: "SCAN" }));
    tabs.splice(1);
    sendMessage.mockClear();
    await context.scan();
    expect(update).toHaveBeenCalledWith(7, { url: "https://portaldeservicos.pdpj.jus.br/central-comunicacoes" });
    expect(sendMessage.mock.calls.some((args: any) => args[1]?.type === "SCAN")).toBe(false);
    await context.scan();
    expect(update).toHaveBeenCalledOnce();
  });
});
