// Only controls reported from the public Diario form. No detail/document links.
const JusbrDom = (() => {
  const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
  const accessibleText = (el) => {
    if (!el) return "";
    const copy = el.cloneNode(true);
    copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
    return text(copy);
  };
  const name = (el) =>
    el.getAttribute("aria-label") ||
    (el.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => accessibleText(document.getElementById(id)))
      .join(" ")
      .trim() ||
    [...(el.labels || [])].map(accessibleText).join(" ") ||
    accessibleText(el);
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const unique = (items, label) => {
    if (items.length !== 1) throw Error(`Controle ${label} ausente ou ambíguo; estrutura não validada.`);
    return items[0];
  };
  function scope() {
    if (location.pathname !== "/central-comunicacoes")
      throw Error("Central/sessão indisponível. Faça login manualmente; sessão expirada não certificada.");
    const tabs = document.querySelector("#tabs_comunicacoes_processuais");
    if (!tabs) throw Error("Estrutura desconhecida: container de abas ausente.");
    const tab = unique(
      [...tabs.querySelectorAll('[role="tab"]')].filter((el) => visible(el) && /^Diário da Justiça$/i.test(name(el))),
      "Diário da Justiça",
    );
    if (tab.getAttribute("aria-selected") !== "true")
      throw Error("Selecione Diário da Justiça manualmente. Domicílio nunca é aberto.");
    const form = document.querySelector("#form_busca_diario_justica");
    const table = document.querySelector("#diario_justica_tabela");
    if (!visible(form) || !visible(table))
      throw Error("Formulário/tabela indisponíveis; sessão ou estrutura não verificada.");
    return { form, table };
  }
  function button(label, root = document) {
    return unique(
      [...root.querySelectorAll('button,[role="button"]')].filter(
        (el) => visible(el) && name(el).toLocaleLowerCase("pt-BR") === label.toLocaleLowerCase("pt-BR"),
      ),
      label,
    );
  }
  const disabled = (el) => el.disabled || el.getAttribute("aria-disabled") === "true";
  function range() {
    scope();
    const candidates = [...document.querySelectorAll('#diario_justica_tabela *,[role="status"]')].filter(
      (el) =>
        visible(el) &&
        /^\d+\s*-\s*\d+\s*\/\s*\d+$/.test(text(el)) &&
        ![...el.children].some((child) => /^\d+\s*-\s*\d+\s*\/\s*\d+$/.test(text(child))),
    );
    // No paginator CSS dependency: fall back to exact observed counter text.
    const nodes = candidates.length
      ? candidates
      : [...document.querySelectorAll("span,div,p")].filter(
          (el) =>
            visible(el) &&
            /^\d+\s*-\s*\d+\s*\/\s*\d+$/.test(text(el)) &&
            ![...el.children].some((child) => /^\d+\s*-\s*\d+\s*\/\s*\d+$/.test(text(child))),
        );
    const counter = unique(nodes, "contador do Diário");
    const numbers = text(counter).match(/\d+/g).map(Number);
    const [start, end, total] = numbers;
    if (!start || end < start || total < end) throw Error("Resultado vazio NÃO confirmado ou contador inválido.");
    const next = button("próxima");
    const last = button("Última página");
    const atEnd = end === total;
    if (atEnd !== !!disabled(next) || atEnd !== !!disabled(last))
      throw Error("Contador e botões próxima/Última página inconsistentes; cobertura interrompida.");
    return { start, end, total, next };
  }
  function read(period) {
    const { table } = scope();
    const r = range();
    const headers = [...table.querySelectorAll('th,[role="columnheader"]')].map(text);
    const indexes = ["Processo", "Tribunal", "Data de Disponibilização"].map((h) =>
      headers.findIndex((v) => v.toLocaleLowerCase("pt-BR") === h.toLocaleLowerCase("pt-BR")),
    );
    if (indexes.some((i) => i < 0)) throw Error("Cabeçalhos desconhecidos; coleta interrompida.");
    const rows = [];
    for (const row of table.querySelectorAll('tr,[role="row"]')) {
      if (!visible(row)) continue;
      const cells = [...row.querySelectorAll('td,[role="cell"]')];
      if (!cells.length) continue;
      const cnj = text(cells[indexes[0]])
        .replace(/\s/g, "")
        .match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0];
      const date = text(cells[indexes[2]]).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const court = text(cells[indexes[1]]);
      if (!cnj || !date || !court || court.length > 80) throw Error("Linha malformada; cobertura incompleta.");
      const iso = `${date[3]}-${date[2]}-${date[1]}`;
      const parsed = new Date(`${iso}T00:00:00Z`);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso)
        throw Error("Data de linha inválida; cobertura interrompida.");
      if (period && (iso < period.start || iso > period.end))
        throw Error("Resultado obsoleto: data da linha fora da janela pesquisada.");
      rows.push({ cnj, date: iso, court });
    }
    if (rows.length !== r.end - r.start + 1 || rows.length > 100)
      throw Error("Contagem de linhas divergente ou vazio NÃO confirmado.");
    return {
      rows,
      signature: JSON.stringify([r.start, r.end, r.total, rows]),
      start: r.start,
      endIndex: r.end,
      total: r.total,
      next: r.end < r.total,
      end: r.end === r.total,
    };
  }
  function input(form, placeholder) {
    return unique(
      [...form.querySelectorAll("input")].filter(
        (el) => visible(el) && el.type === "text" && el.getAttribute("placeholder") === placeholder,
      ),
      placeholder,
    );
  }
  function setValue(el, value) {
    if (el.disabled || el.readOnly) throw Error("Campo indisponível; pesquisa interrompida.");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw Error("Campo não suportado.");
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    // blur marks Angular controls as touched; no credential inputs are selected.
    el.blur();
    if (el.value !== value || !el.checkValidity()) throw Error("Valor rejeitado no formulário.");
  }
  const truncationText =
    "A pesquisa retornou muitos resultados e estamos exibindo os 100 primeiros. Caso deseje refinar a busca, favor utilizar outros filtros.";
  function truncated() {
    return [...document.querySelectorAll("p,span,div")].some((el) => visible(el) && text(el) === truncationText);
  }
  function assertNotTruncated() {
    if (truncated()) {
      const error = Error("100 primeiros: busca truncada; cobertura incompleta.");
      error.code = "TRUNCATED";
      throw error;
    }
  }
  const loading = () => [...document.querySelectorAll('mat-progress-bar#is_loading[role="progressbar"]')].some(visible);
  async function confirmCalendar(form, period) {
    button("Open calendar", form).click();
    const format = (iso) => iso.split("-").reverse().join("/");
    for (const iso of [period.start, period.end]) {
      let selected = false;
      for (let step = 0; step < 14; step++) {
        const days = [...document.querySelectorAll("button[aria-label]")].filter(
          (el) => visible(el) && /^\d{2}\/\d{2}\/\d{4}$/.test(el.getAttribute("aria-label") || ""),
        );
        const target = days.filter((el) => el.getAttribute("aria-label") === format(iso));
        if (target.length === 1) {
          if (disabled(target[0])) throw Error("Dia indisponível no calendário.");
          target[0].click();
          selected = true;
          break;
        }
        if (!days.length) throw Error("Calendário sem dias identificáveis; período não confirmado.");
        const shown = days[0].getAttribute("aria-label").split("/");
        const month = `${shown[2]}-${shown[1]}`;
        button(iso.slice(0, 7) < month ? "Previous month" : "Next month").click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!selected) throw Error("Período não localizado no calendário.");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    button("Selecionar").click();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  async function wait(action, accept, evidence = null, report = () => {}) {
    let started = false;
    let completed = false;
    const inspect = () => {
      if (loading()) started = true;
      else if (started) completed = true;
    };
    if (evidence && loading()) throw Error("Busca anterior ainda carregando; retomada preservada.");
    const observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    try {
      action();
      inspect();
      const timeout = evidence ? 120000 : 20000;
      const deadline = Date.now() + timeout;
      let stable = "";
      let since = 0;
      let lastStatus = 0;
      let reason = "";
      while (Date.now() < deadline) {
        inspect();
        if (evidence && Date.now() - lastStatus >= 10000) {
          report(`Aguardando busca: ${started ? "carregamento observado" : "aguardando #is_loading"}; limite 120s.`);
          lastStatus = Date.now();
        }
        if (!evidence || (started && completed && !loading())) {
          if (evidence) evidence.validate();
          assertNotTruncated();
          if (evidence?.prepare && !evidence.prepare()) {
            stable = "";
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          }
          try {
            const result = read(evidence?.period);
            if (accept(result)) {
              if (stable !== result.signature) {
                stable = result.signature;
                since = Date.now();
              }
              if (Date.now() - since >= 500) return result;
            } else stable = "";
          } catch (e) {
            if (/sessão|Estrutura|Selecione|obsoleto/.test(e.message)) throw e;
            reason = e.message;
            stable = "";
          }
        } else stable = "";
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw Error(
        `${evidence ? "Busca sem ciclo #is_loading presente→ausente e resposta válida em 120s" : "Avanço sem conclusão comprovada em 20s"}${reason ? ": " + reason : ""}; vazio não confirmado. Retomada preservada.`,
      );
    } finally {
      observer.disconnect();
    }
  }
  function create(setting, period, report = () => {}) {
    return {
      verified: true,
      async search(state) {
        const { form } = scope();
        const process = input(form, "0000000-00.0000.0.00.0000");
        const oab = input(form, "UF1234567A ou UF1234567");
        const start = input(form, "Data inicial");
        const end = input(form, "Data final");
        for (const date of [period.start, period.end]) {
          const parsed = new Date(`${date}T00:00:00Z`);
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== date
          )
            throw Error("Janela de datas inválida.");
        }
        if (period.start > period.end) throw Error("Janela de datas invertida.");
        if (!/^[A-Z]{2}$/.test(setting.oab_uf) || !/^\d+$/.test(setting.oab_number)) throw Error("OAB/UF inválidas.");
        const format = (el, date) => (el.type === "date" ? date : date.split("-").reverse().join("/"));
        setValue(process, "");
        setValue(oab, setting.oab_uf + setting.oab_number);
        setValue(start, format(start, period.start));
        setValue(end, format(end, period.end));
        await confirmCalendar(form, period);
        const search = button("Buscar", form);
        if (disabled(search)) throw Error("Buscar indisponível.");
        const validate = () => {
          const current = scope().form;
          if (
            input(current, "0000000-00.0000.0.00.0000").value !== "" ||
            input(current, "UF1234567A ou UF1234567").value !== setting.oab_uf + setting.oab_number ||
            input(current, "Data inicial").value !== format(start, period.start) ||
            input(current, "Data final").value !== format(end, period.end)
          )
            throw Error("Filtros alterados; cobertura interrompida.");
        };
        let resetting = false;
        const prepare = () => {
          if (loading()) return false;
          if (!resetting) {
            const first = button("Primeira página");
            resetting = true;
            if (!disabled(first)) {
              first.click();
              report("Nova pesquisa manteve paginação; retornando à primeira página.");
              return false;
            }
          }
          return range().start === 1;
        };
        await wait(
          () => search.click(),
          (result) => result.start === 1,
          { period, validate, prepare },
          report,
        );
        for (let page = 1; page < state.page; page++) await this.next();
      },
      async read() {
        assertNotTruncated();
        return read(period);
      },
      async next() {
        const before = read(period);
        const next = range().next;
        if (disabled(next)) throw Error("Próxima desabilitada antes do avanço esperado.");
        await wait(
          () => next.click(),
          (result) =>
            result.start === before.endIndex + 1 &&
            result.total === before.total &&
            result.rows.every((row) => row.date >= period.start && row.date <= period.end),
        );
      },
    };
  }
  return { create, read, scope };
})();
globalThis.JusbrDom = JusbrDom;
