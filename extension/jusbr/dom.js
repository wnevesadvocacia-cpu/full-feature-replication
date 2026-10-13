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
  function scope(requireTable = false) {
    if (location.pathname !== "/central-comunicacoes")
      throw Error(
        "Central de Comunicações não está aberta nesta aba. Abra Diário da Justiça; o estado do login não foi confirmado.",
      );
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
    if (!visible(form)) throw Error("Formulário do Diário indisponível; aguarde o carregamento da Central.");
    if (requireTable && !visible(table))
      throw Error("Resposta do Diário sem tabela válida; vazio e cobertura não confirmados.");
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
  // Public bundle 831.d74efc00acb3737c.js: unfiltered <=10 results hide
  // the paginator. Searches do NOT reset pageIndex; Limpar filtros does.
  // Pin this exception to the inspected public build, DOM and search evidence.
  function singlePageRoot() {
    if (![...document.querySelectorAll('script[src]')].some((el) =>
      el.getAttribute('src')?.match(/(?:^|\/)main\.1da43b09b020e9bd\.js$/))) return null;
    const roots = [...document.querySelectorAll('app-diario-justica')].filter(visible);
    if (roots.length !== 1) return null;
    const { form, table } = scope();
    return roots[0].contains(form) && roots[0].contains(table) ? roots[0] : null;
  }
  function supplementalFilters(root) {
    const panel = root.querySelector('#filtro-diario-justica');
    if (!visible(panel)) throw Error('Filtros complementares do Diário não verificados; retomada preservada.');
    const fields = ['input[placeholder="Selecione um Tribunal"]', 'input[placeholder="Selecione uma Classe Judicial"]', 'input[name="partes"]']
      .map((selector) => unique([...panel.querySelectorAll(selector)].filter(visible), 'filtro complementar'));
    if (fields.some((el) => el.value.trim())) throw Error('Filtros complementares ativos; cobertura interrompida.');
    return panel;
  }
  function range(onePage = null) {
    scope(true);
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
    if (!nodes.length && onePage?.()) {
      const { table } = scope(true);
      const root = singlePageRoot();
      const controls = root && [...root.querySelectorAll('mat-paginator,button,[role="button"]')].filter((el) =>
        visible(el) && (el.tagName.toLowerCase() === 'mat-paginator' || /^(primeira página|anterior|próxima|última página)$/i.test(name(el))));
      const count = [...table.querySelectorAll('tr,[role="row"]')].filter((row) => visible(row) && row.querySelector('td,[role="cell"]')).length;
      if (root && !controls.length && count >= 1 && count <= 10) {
        supplementalFilters(root);
        return { start: 1, end: count, total: count, next: null, singlePage: true };
      }
    }
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
  function read(period, onePage = null) {
    const { table } = scope(true);
    const r = range(onePage);
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
        throw Error(`Resultado obsoleto: data ${iso} fora da janela ${period.start} a ${period.end}. Filtro aplicado pelo portal não comprovado, mesmo com campos preenchidos ou calendário selecionado${truncated() ? '; aviso dos 100 primeiros também presente' : ''}. Nenhum lote desta resposta enviado; cobertura incompleta e retomada preservada.`);
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
      singlePage: r.singlePage === true,
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
  async function wait(action, accept, evidence = null, report = () => {}, guard = evidence?.validate, period = evidence?.period) {
    let started = false;
    let completed = false;
    let stable = "";
    let since = 0;
    const inspect = () => {
      if (loading()) {
        started = true;
        completed = false;
        stable = "";
      }
      else if (started) completed = true;
    };
    const settled = (signature) => {
      if (stable !== signature) { stable = signature; since = Date.now(); }
      return Date.now() - since >= 500;
    };
    if (evidence && loading()) throw Error("Busca anterior ainda carregando; retomada preservada.");
    const observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    try {
      action();
      inspect();
      const timeout = evidence ? 120000 : 20000;
      const deadline = Date.now() + timeout;
      let lastStatus = 0;
      let reason = "";
      while (Date.now() < deadline) {
        inspect();
        if (evidence && Date.now() - lastStatus >= 10000) {
          report(`Aguardando busca: ${started ? "carregamento observado" : "aguardando #is_loading"}; limite 120s.`);
          lastStatus = Date.now();
        }
        if (!loading() && (!evidence || (started && completed))) {
          guard?.();
          try {
            if (evidence?.prepare && !evidence.prepare()) {
              stable = "";
              await new Promise((resolve) => setTimeout(resolve, 100));
              continue;
            }
            // The bar can disappear before Angular repaints the table. Both a
            // valid response and a stale/truncated diagnosis must settle first.
            // Dates retain priority over truncation once the first page is ready.
            const result = read(period, evidence?.onePage);
            assertNotTruncated();
            if (accept(result)) {
              if (settled(`result:${result.signature}`)) return result;
            } else stable = "";
          } catch (e) {
            if (/sessão|Estrutura|Selecione/.test(e.message)) throw e;
            reason = e.message;
            if (e.code === "TRUNCATED" || /obsoleto/.test(e.message)) {
              if (settled(`error:${e.code || "STALE"}:${e.message}`)) {
                if (/obsoleto/.test(e.message)) await report(`Conferência interrompida: ${e.message}`);
                throw e;
              }
            } else stable = "";
          }
        } else stable = "";
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const failure = !evidence ? 'Avanço sem conclusão comprovada em 20s' :
        !started ? 'Busca sem ciclo #is_loading presente→ausente em 120s' :
        !completed ? 'Carregamento observado, mas sem conclusão em 120s' :
        'Ciclo de carregamento concluído, mas resposta não validada em 120s';
      throw Error(`${failure}${reason ? ': ' + reason : ''}; vazio não confirmado. Retomada preservada.`);
    } finally {
      observer.disconnect();
    }
  }
  function create(setting, period, report = () => {}) {
    let validateFilters;
    let singlePageReady = false;
    let resetVerified = false;
    const onePage = () => {
      const root = singlePageRoot();
      if (!resetVerified || !root) return false;
      supplementalFilters(root);
      return true;
    };
    return {
      verified: true,
      async search(state) {
        singlePageReady = false;
        resetVerified = false;
        const { form } = scope();
        if (loading()) throw Error('Busca anterior ainda carregando; retomada preservada.');
        const root = singlePageRoot();
        if (root) {
          const panel = root.querySelector('#filtro-diario-justica');
          if (visible(panel)) {
            // Public UI reset clears all three client filters and pageIndex.
            button('Limpar filtros', panel).click();
            await new Promise((resolve) => setTimeout(resolve, 100));
            supplementalFilters(root);
            resetVerified = true;
          } else if (!root.querySelector('app-lista') && !root.querySelector('mat-paginator')) {
            // Inspected component initial state has pageIndex=0; the first
            // nonempty response mounts the filter panel, validated at read.
            resetVerified = true;
          }
        }
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
          if (resetVerified && singlePageRoot()?.querySelector('#filtro-diario-justica')) supplementalFilters(singlePageRoot());
        };
        validateFilters = validate;
        let resetting = false;
        const prepare = () => {
          if (loading()) return false;
          // The return button is optional; when absent, the counter error (repaint,
          // unknown empty state) is reported as the real reason instead.
          let counterError = null;
          try {
            if (range(onePage).start === 1) return true;
          } catch (error) {
            counterError = error;
          }
          if (resetting) return false;
          const first = [...document.querySelectorAll('button,[role="button"]')].filter(
            (el) => visible(el) && name(el).toLocaleLowerCase("pt-BR") === "primeira página",
          );
          if (first.length !== 1 || disabled(first[0]))
            throw counterError || Error("Nova pesquisa manteve paginação e Primeira página não está disponível; aguardando primeira página.");
          resetting = true;
          first[0].click();
          report("Nova pesquisa manteve paginação; retornando à primeira página.");
          return false;
        };
        const result = await wait(
          () => search.click(),
          (result) => result.start === 1,
          { period, validate, prepare, onePage },
          report,
        );
        singlePageReady = true;
        if (result.singlePage && state.page > 1)
          throw Error('Retomada exige página posterior, mas resposta atual tem uma só página; lotes preservados.');
        for (let page = 1; page < state.page; page++) await this.next();
      },
      async read() {
        validateFilters?.();
        if (loading()) throw Error("Diário ainda carregando; nenhum lote desta resposta enviado. Retomada preservada.");
        const result = read(period, singlePageReady ? onePage : null);
        assertNotTruncated();
        return result;
      },
      async next() {
        validateFilters?.();
        if (loading()) throw Error("Diário ainda carregando; paginação interrompida com retomada preservada.");
        const before = read(period, singlePageReady ? onePage : null);
        assertNotTruncated();
        if (before.singlePage) throw Error('Resposta de uma página sem avanço; retomada preservada.');
        const next = range().next;
        if (disabled(next)) throw Error("Próxima desabilitada antes do avanço esperado.");
        await wait(
          () => next.click(),
          (result) =>
            result.start === before.endIndex + 1 &&
            result.total === before.total &&
            result.rows.every((row) => row.date >= period.start && row.date <= period.end),
          null, report, validateFilters, period,
        );
      },
    };
  }
  return { create, read, scope };
})();
globalThis.JusbrDom = JusbrDom;
