import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
const cnj = "1003778-63.2024.8.26.0084";
function fixture(total = 9, size = 3) {
  document.body.innerHTML = `<div id="tabs_comunicacoes_processuais"><button role="tab" aria-selected="true">Diário da Justiça</button><button role="tab">Domicílio Eletrônico</button></div>
  <form id="form_busca_diario_justica"><label>Número do Processo<input type="text" placeholder="0000000-00.0000.0.00.0000"></label><label>Número da OAB<input type="text" placeholder="UF1234567A ou UF1234567"></label><label>Período<input type="text" placeholder="Data inicial"></label><label>Data final<input type="text" placeholder="Data final"></label><button type="button">Buscar</button></form>
  <div id="diario_justica_tabela"><table><thead><tr>${["Processo", "Partes", "Tipo de Comunicação", "Tribunal", "Classe", "Data de Disponibilização"].map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody></tbody></table></div>
  <span role="status">1 - 3 / 9</span><button aria-label="Primeira página" disabled></button><button aria-label="anterior" disabled></button><button aria-label="próxima"></button><button aria-label="Última página"></button>`;
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  const openCalendar = document.createElement("button");
  openCalendar.type = "button";
  openCalendar.setAttribute("aria-label", "Open calendar");
  document.querySelector("form")!.append(openCalendar);
  openCalendar.onclick = () => {
    const calendar = document.createElement("div");
    calendar.id = "test-calendar";
    calendar.innerHTML =
      Array.from(
        { length: 31 },
        (_, i) => `<button type="button" aria-label="${String(i + 1).padStart(2, "0")}/10/2026">${i + 1}</button>`,
      ).join("") + '<button type="button">Selecionar</button>';
    document.body.append(calendar);
    calendar.querySelector("button:last-child")!.addEventListener("click", () => calendar.remove());
  };
  let page = 1;
  const render = (date = "06/10/2026") => {
    const tbody = document.querySelector("tbody");
    const counter = document.querySelector('[role="status"]');
    const next = document.querySelector<HTMLButtonElement>('[aria-label="próxima"]');
    const last = document.querySelector<HTMLButtonElement>('[aria-label="Última página"]');
    if (!tbody || !counter || !next || !last) throw Error("fixture");
    const start = (page - 1) * size + 1;
    const end = Math.min(page * size, total);
    tbody.innerHTML = Array.from(
      { length: end - start + 1 },
      () =>
        `<tr><td>${cnj}</td><td>Público</td><td>Intimação</td><td>TJSP</td><td>Classe</td><td>${date}</td><td><button>Peticionar</button><button>Visualizar Detalhes</button><button>Visualizar Documento</button></td></tr>`,
    ).join("");
    counter.textContent = `${start} - ${end} / ${total}`;
    next.disabled = end === total;
    last.disabled = end === total;
    document.querySelector<HTMLButtonElement>('[aria-label="Primeira página"]')!.disabled = page === 1;
  };
  render("05/10/2026");
  const forbidden = vi.fn();
  document.addEventListener(
    "click",
    (e) => {
      if (/Peticionar|Visualizar|Domicílio/.test((e.target as HTMLElement).textContent || "")) forbidden();
    },
    { signal: controller.signal },
  );
  const search = document.querySelector<HTMLButtonElement>("form button");
  const next = document.querySelector<HTMLButtonElement>('[aria-label="próxima"]');
  if (!search || !next) throw Error("fixture");
  const begin = () => {
    const bar = document.createElement("mat-progress-bar");
    bar.id = "is_loading";
    bar.setAttribute("role", "progressbar");
    document.body.append(bar);
    return bar;
  };
  search.onclick = () => {
    page = 1;
    const bar = begin();
    setTimeout(() => {
      render();
      bar.remove();
    }, 100);
  };
  next.onclick = () => {
    page++;
    render();
  };
  document.querySelector<HTMLButtonElement>('[aria-label="Primeira página"]')!.onclick = () => {
    page = 1;
    render();
  };
  const context = vm.createContext({
    document,
    location: { pathname: "/central-comunicacoes" },
    HTMLInputElement,
    Event,
    MutationObserver,
    getComputedStyle,
    Date,
    setTimeout,
    crypto,
  });
  vm.runInContext(fs.readFileSync("extension/jusbr/core.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("extension/jusbr/dom.js", "utf8"), context);
  return { dom: context.JusbrDom, core: context.JusbrCore, forbidden, next, search, render, begin };
}
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
let controller = new AbortController();
afterEach(() => {
  controller.abort();
  controller = new AbortController();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});
const setting = { oab_uf: "SP", oab_number: "290702" };
const period = { start: "2026-10-01", end: "2026-10-08" };
describe("adaptador Diário com controles relatados", () => {
  it("confirma as datas no calendário e retorna à primeira página quando Buscar mantém o contador anterior", async () => {
    const { dom, next, search, begin, render } = fixture();
    next.click();
    next.click();
    const first = document.querySelector<HTMLButtonElement>('[aria-label="Primeira página"]')!;
    const firstClick = vi.spyOn(first, "click");
    const selected = vi.fn();
    document.addEventListener(
      "click",
      (e) => {
        if ((e.target as HTMLElement).textContent === "Selecionar") selected();
      },
      { signal: controller.signal },
    );
    search.onclick = () => {
      const bar = begin();
      setTimeout(() => {
        render();
        bar.remove();
      }, 100);
    };
    await dom.create(setting, period).search({ page: 1 });
    expect(selected).toHaveBeenCalledTimes(1);
    expect(firstClick).toHaveBeenCalledTimes(1);
    expect(dom.read().start).toBe(1);
  });
  it("reconhece Buscar com ícone Angular Material oculto da acessibilidade observado no portal real", async () => {
    const { dom, search } = fixture();
    search.innerHTML =
      '<span class="mat-button-wrapper"><span class="icon-text"><mat-icon role="img" aria-hidden="true">search</mat-icon><span class="ml-1">Buscar</span></span></span>';
    const click = vi.spyOn(search, "click");
    await dom.create(setting, period).search({ page: 1 });
    expect(click).toHaveBeenCalledTimes(1);
    expect((await dom.read()).start).toBe(1);
  });
  it("percorre 1–10/29, 11–20/29 e 21–29/29 e termina com nove linhas e os dois botões desabilitados", async () => {
    const { dom, core, next, forbidden } = fixture(29, 10);
    const emit = vi.fn();
    const save = vi.fn();
    const click = vi.spyOn(next, "click");
    await core.collect(
      dom.create(setting, period),
      { run: crypto.randomUUID(), page: 1, seen: [], period },
      save,
      emit,
    );
    expect(emit.mock.calls.map((c) => c[0].rows.length)).toEqual([10, 10, 9]);
    expect(emit.mock.calls.map((c) => c[0].coverage.page)).toEqual([1, 2, 3]);
    expect(click).toHaveBeenCalledTimes(2);
    expect(dom.read()).toMatchObject({ start: 21, endIndex: 29, total: 29, end: true, next: false });
    expect(next.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Última página"]')?.disabled).toBe(true);
    expect(save.mock.calls.at(-1)?.[0].finished).toBe(true);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("não confirma fim se Última página divergir do contador ou da próxima", () => {
    const { dom } = fixture(9, 9);
    const last = document.querySelector<HTMLButtonElement>('[aria-label="Última página"]');
    if (!last) throw Error("fixture");
    last.disabled = false;
    expect(() => dom.read()).toThrow("inconsistentes");
  });
  it("pesquisa OAB UF+número e período, avança três páginas preservando três atos iguais, sem ações de linha", async () => {
    const { dom, core, forbidden } = fixture();
    const emit = vi.fn();
    const save = vi.fn();
    await core.collect(
      dom.create(setting, period),
      { run: crypto.randomUUID(), page: 1, seen: [], period },
      save,
      emit,
    );
    expect(emit.mock.calls.map((c) => c[0].coverage.page)).toEqual([1, 2, 3]);
    expect(emit.mock.calls.map((c) => c[0].rows.length)).toEqual([3, 3, 3]);
    expect(document.querySelectorAll("input")[1].value).toBe("SP290702");
    expect(document.querySelectorAll("input")[2].value).toBe("01/10/2026");
    expect(document.querySelectorAll("input")[3].value).toBe("08/10/2026");
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("reconstrói filtros e chega à página de retomada pelo contador", async () => {
    const { dom } = fixture();
    const adapter = dom.create(setting, period);
    await adapter.search({ page: 2 });
    const result = await adapter.read();
    expect(result.start).toBe(4);
    expect(result.endIndex).toBe(6);
  });
  it("interrompe antes de Buscar se início/fim forem ambíguos", async () => {
    const { dom, search } = fixture();
    const click = vi.spyOn(search, "click");
    document.querySelectorAll("input")[2].setAttribute("placeholder", "Período");
    await expect(dom.create(setting, period).search({ page: 1 })).rejects.toThrow("ausente ou ambíguo");
    expect(click).not.toHaveBeenCalled();
  });
  it("emite input/change/blur nos campos exatos mesmo com nome acessível Período", async () => {
    const { dom } = fixture();
    const events: string[] = [];
    const start = document.querySelector<HTMLInputElement>('[placeholder="Data inicial"]');
    if (!start) throw Error("fixture");
    for (const type of ["input", "change", "blur"]) start.addEventListener(type, () => events.push(type));
    await dom.create(setting, period).search({ page: 1 });
    expect(events).toEqual(["input", "change", "blur"]);
    expect(start.value).toBe("01/10/2026");
  });
  it("não envia linhas antigas com contador estável e mutação irrelevante após Buscar", async () => {
    const { dom, core, search } = fixture();
    const emit = vi.fn();
    search.onclick = () => document.querySelector("tbody")?.append(document.createComment("mutation"));
    const pending = core.collect(
      dom.create(setting, period),
      { run: "stale", page: 1, seen: [], period },
      vi.fn(),
      emit,
    );
    const assertion = expect(pending).rejects.toThrow("sem ciclo");
    await vi.advanceTimersByTimeAsync(122000);
    await assertion;
    expect(emit).not.toHaveBeenCalled();
  }, 25000);
  it("aceita dados idênticos sem esvaziar tabela somente após ciclo comprovado", async () => {
    const { dom, search, begin } = fixture();
    search.onclick = () => {
      const bar = begin();
      setTimeout(() => bar.remove(), 100);
    };
    await dom.create(setting, period).search({ page: 1 });
    expect((await dom.read()).rows[0].date).toBe("2026-10-05");
  });
  it("rejeita esvaziamento/reapresentação idêntica sem ciclo loading", async () => {
    const { dom, search, render } = fixture();
    search.onclick = () => {
      document.querySelector("tbody")?.replaceChildren();
      setTimeout(() => render("05/10/2026"), 100);
    };
    const assertion = expect(dom.create(setting, period).search({ page: 1 })).rejects.toThrow("sem ciclo");
    await vi.advanceTimersByTimeAsync(122000);
    await assertion;
  });
  it("observa ciclo síncrono iniciado no clique e espera conclusão longa até 120s", async () => {
    const { dom, search, begin } = fixture();
    const report = vi.fn();
    search.onclick = () => {
      const bar = begin();
      setTimeout(() => bar.remove(), 90000);
    };
    const done = vi.fn();
    const pending = dom.create(setting, period, report).search({ page: 1 }).then(done);
    await vi.advanceTimersByTimeAsync(89000);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    await pending;
    expect(done).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalled();
  });
  it("interrompe loading que não termina em 120s", async () => {
    const { dom, search, begin } = fixture();
    search.onclick = begin;
    const assertion = expect(dom.create(setting, period).search({ page: 1 })).rejects.toThrow("120s");
    await vi.advanceTimersByTimeAsync(122000);
    await assertion;
  });
  it("rejeita filtros alterados durante loading", async () => {
    const { dom, search, begin } = fixture();
    search.onclick = () => {
      const bar = begin();
      document.querySelectorAll("input")[1].value = "RJ1";
      setTimeout(() => bar.remove(), 100);
    };
    await expect(dom.create(setting, period).search({ page: 1 })).rejects.toThrow("Filtros alterados");
  });
  it("contador 100 com aviso exato não certifica cobertura", async () => {
    const { dom, search, begin } = fixture(100, 10);
    search.onclick = () => {
      const bar = begin();
      const p = document.createElement("p");
      p.textContent =
        "A pesquisa retornou muitos resultados e estamos exibindo os 100 primeiros. Caso deseje refinar a busca, favor utilizar outros filtros.";
      document.body.append(p);
      setTimeout(() => bar.remove(), 100);
    };
    await expect(dom.create(setting, period).search({ page: 1 })).rejects.toMatchObject({ code: "TRUNCATED" });
  });
  it("rejeita resposta alterada com datas fora da janela do dia", async () => {
    const { dom, core } = fixture();
    const emit = vi.fn();
    const day = { start: "2026-10-08", end: "2026-10-08" };
    const pending = core.collect(
      dom.create(setting, day),
      { run: "outside", page: 1, seen: [], period: day },
      vi.fn(),
      emit,
    );
    const assertion = expect(pending).rejects.toThrow("Resultado obsoleto");
    await assertion;
    expect(emit).not.toHaveBeenCalled();
  }, 25000);
  it("aguarda saída dos dados antigos, transição e resposta estável dentro do dia", async () => {
    const { dom, search, render, begin } = fixture();
    const day = { start: "2026-10-08", end: "2026-10-08" };
    search.onclick = () => {
      const bar = begin();
      setTimeout(() => {
        render("08/10/2026");
        bar.remove();
      }, 1500);
    };
    const done = vi.fn();
    const adapter = dom.create(setting, day);
    const pending = adapter.search({ page: 1 }).then(done);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(done).not.toHaveBeenCalled();
    await pending;
    expect(done).toHaveBeenCalledTimes(1);
    expect((await adapter.read()).rows.every((row: { date: string }) => row.date === "2026-10-08")).toBe(true);
  });
  it("não aceita vazio desconhecido e não seleciona Domicílio", () => {
    const { dom, forbidden } = fixture();
    const body = document.querySelector("tbody");
    if (body) body.innerHTML = "";
    expect(() => dom.read()).toThrow("vazio NÃO confirmado");
    document.querySelector('[role="tab"]')?.setAttribute("aria-selected", "false");
    expect(() => dom.scope()).toThrow("Domicílio nunca");
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("interrompe quando próxima não muda efetivamente a página", async () => {
    const { dom, next } = fixture();
    next.onclick = () => {};
    const assertion = expect(dom.create(setting, period).next()).rejects.toThrow("sem conclusão comprovada");
    await vi.advanceTimersByTimeAsync(20100);
    await assertion;
  }, 25000);
  it("não reenvia ID imutável com dados diferentes após interrupção", async () => {
    const { core } = fixture();
    const emit = vi.fn();
    await expect(
      core.collect(
        { verified: true, search: vi.fn(), read: async () => ({ rows: [{ cnj }], signature: "changed", end: true }) },
        { page: 1, run: "r", seen: [], batchId: "persisted", pendingSignature: "original" },
        vi.fn(),
        emit,
      ),
    ).rejects.toThrow("Página mudou");
    expect(emit).not.toHaveBeenCalled();
  });
});
