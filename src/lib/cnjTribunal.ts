// Resolve tribunal a partir do número CNJ com precisão cirúrgica.
// Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
// J = segmento do Poder Judiciário; TR = tribunal dentro do segmento.

// Códigos CNJ dos Tribunais de Justiça (ordem alfabética oficial), NÃO confundir com IBGE.
// Códigos oficiais CNJ (Res. 65/2008) — ordem alfabética das UFs.
// Atenção: NÃO seguem IBGE. Ex.: 16=PR, 17=PE, 18=PI, 21=RS, 22=RO, 23=RR.
const UF_BY_CODE: Record<string, string> = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE',
  '07': 'DF', '08': 'ES', '09': 'GO', '10': 'MA', '11': 'MT', '12': 'MS',
  '13': 'MG', '14': 'PA', '15': 'PB', '16': 'PR', '17': 'PE', '18': 'PI',
  '19': 'RJ', '20': 'RN', '21': 'RS', '22': 'RO', '23': 'RR', '24': 'SC',
  '25': 'SE', '26': 'SP', '27': 'TO',
};

export type TribunalInfo = {
  sigla: string;        // ex.: TJSP, TRF3, TRT02, TJM-SP
  nome: string;         // nome por extenso
  segmento: string;     // ex.: "Justiça Estadual"
  uf?: string;          // quando aplicável
  cnjValido: boolean;
  /** Sistema de tramitação eletrônica principal do tribunal (ex.: e-SAJ, PJe, eproc). */
  sistema?: string;
  /** Sistemas secundários/legados ainda em uso no mesmo tribunal. */
  sistemasAlternativos?: string[];
};

// Sistemas de tramitação eletrônica por tribunal (praxis 2026). Vários tribunais operam
// mais de um sistema (migração em curso) — o principal vem em `sistema` e os demais em
// `sistemasAlternativos`; o advogado confere no cabeçalho da publicação.
const SISTEMA_BY_SIGLA: Record<string, [string, string[]?]> = {
  // ===== Justiça Estadual =====
  TJAC: ['e-SAJ'], TJAL: ['e-SAJ', ['PJe']], TJAP: ['PJe'], TJAM: ['Projudi', ['e-SAJ', 'PJe']],
  TJBA: ['PJe', ['eproc (em implantação)']], TJCE: ['PJe', ['e-SAJ']], TJDFT: ['PJe'], TJES: ['PJe'],
  TJGO: ['Projudi', ['PJe']], TJMA: ['PJe'], TJMT: ['PJe'], TJMS: ['e-SAJ', ['eproc (em implantação)']],
  // TJMG: migração para o eproc é gradual por comarca/unidade (Port. Conjunta 1720/PR/2025);
  // sem indicação no texto da publicação o sistema é ambíguo (PJe ainda ativo em muitas unidades).
  TJMG: ['PJe ou eproc', ['PJe', 'eproc', 'Themis / SEEU']], TJPA: ['PJe', ['Libra']], TJPB: ['PJe'],
  TJPR: ['Projudi', ['eproc (em implantação)']], TJPE: ['PJe'], TJPI: ['PJe'],
  TJRJ: ['PJe', ['eproc (em implantação)', 'Portal de Serviços TJRJ']],
  TJRN: ['PJe'], TJRS: ['eproc', ['Themis']], TJRO: ['PJe'], TJRR: ['PJe', ['Projudi']],
  TJSC: ['eproc', ['e-SAJ']], TJSP: ['e-SAJ', ['PJe (2º grau/JEF)']], TJSE: ['PJe'], TJTO: ['eproc'],
  // ===== Justiça Federal =====
  TRF1: ['PJe'], TRF2: ['eproc', ['PJe']], TRF3: ['PJe'], TRF4: ['eproc'], TRF5: ['PJe'],
  TRF6: ['eproc', ['PJe (legado)']],
  CJF: ['PJe'],
  // ===== Superiores / especiais =====
  STF: ['e-STF (Portal do Processo Eletrônico)'], STJ: ['CPE — Central do Processo Eletrônico'],
  TST: ['PJe'], TSE: ['PJe'], STM: ['e-Proc STM'],
  // ===== Justiça Militar Estadual =====
  'TJM-SP': ['e-SAJ'], 'TJM-MG': ['PJe'], 'TJM-RS': ['eproc'],
};

/** Resolve o sistema eletrônico a partir da sigla (TRTs e TREs usam PJe em todas as regiões). */
export function sistemaFromSigla(sigla?: string | null): { sistema?: string; alternativos?: string[] } {
  if (!sigla) return {};
  const s = sigla.toUpperCase();
  const hit = SISTEMA_BY_SIGLA[s];
  if (hit) return { sistema: hit[0], alternativos: hit[1] };
  if (/^TRT\d+/.test(s)) return { sistema: 'PJe' };
  if (/^TRE-/.test(s)) return { sistema: 'PJe' };
  return {};
}

/** Detecta menção explícita ao sistema no texto da publicação (prevalece sobre o padrão do tribunal). */
export function sistemaFromContent(content?: string | null): string | null {
  if (!content) return null;
  const t = content.toLowerCase();
  if (/\beproc\b|e-?proc\b/.test(t)) return 'eproc';
  if (/\bpje\b|processo judicial eletr[oô]nico/.test(t)) return 'PJe';
  if (/\be-?saj\b|esaj\b/.test(t)) return 'e-SAJ';
  if (/\bprojudi\b/.test(t)) return 'Projudi';
  if (/\bthemis\b/.test(t)) return 'Themis';
  if (/\blibra\b/.test(t)) return 'Libra';
  // Publicações do eproc trazem o número CNJ seguido da UF (/SP, /MG etc.) e
  // qualificam os representantes como ADVOGADO(A). Essa assinatura de origem
  // permite identificar o sistema mesmo quando o corpo do ato não cita "eproc".
  const eprocOrigin = /\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\s*\/\s*[a-z]{2}\b/i.test(content)
    // O DJEN frequentemente concatena o nome com ADVOGADO(A), sem espaço.
    && /advogado\s*\(\s*a\s*\)\s*:/i.test(content)
    && /\b(?:autor|r[ée]u|requerente|requerido|exequente|executado|recorrente|recorrido|apelante|apelado)\s*:/i.test(content);
  if (eprocOrigin) return 'eproc';
  return null;
}

/** Aviso de migração de sistema (o destino prevalece sobre menções soltas ao sistema antigo). */
const MIGRACAO_RX =
  /(passar[áa]\s+a\s+tramitar|passou\s+a\s+tramitar|tramitar[áa]\s+(?:exclusivamente\s+)?(?:no|pelo|via)|comunica[çc][õo]es\s+subsequentes|migra[çc][ãa]o\s+(?:de\s+)?(?:todo\s+)?(?:o\s+)?acervo|migrad[oa]s?\s+para|redistribu[íi]d[oa]s?\s+(?:no|para\s+o)\s+sistema|implanta[çc][ãa]o\s+do\s+sistema)/i;

/**
 * Resolve o sistema a partir de VÁRIAS publicações/movimentações do mesmo processo.
 * Um aviso de migração em qualquer delas prevalece sobre menções isoladas.
 */
export function sistemaFromContents(contents: (string | null | undefined)[]): string | null {
  let fallback: string | null = null;
  for (const c of contents) {
    if (!c) continue;
    const m = MIGRACAO_RX.exec(c);
    if (m) {
      const alvo = sistemaFromContent(c.slice(m.index, m.index + 400));
      if (alvo) return alvo;
    }
    if (!fallback) fallback = sistemaFromContent(c);
  }
  return fallback;
}

export type SistemaEvent = { content?: string | null; date?: string | null };

/**
 * Resolve o sistema vigente NA DATA de referência (precisão temporal):
 * vale a última migração publicada em data <= asOf; sem migração, a última
 * menção explícita ao sistema em data <= asOf. Válido para qualquer tribunal.
 */
export function sistemaAsOf(events: SistemaEvent[], asOf?: string | null): string | null {
  const limit = asOf ? String(asOf).slice(0, 10) : null;
  let mig: { date: string; sistema: string } | null = null;
  let men: { date: string; sistema: string } | null = null;
  for (const ev of events) {
    const c = ev?.content;
    if (!c) continue;
    const d = (ev.date ? String(ev.date).slice(0, 10) : '') || '0000-00-00';
    if (limit && d > limit) continue;
    const m = MIGRACAO_RX.exec(c);
    if (m) {
      const alvo = sistemaFromContent(c.slice(m.index, m.index + 400));
      if (alvo && (!mig || d >= mig.date)) mig = { date: d, sistema: alvo };
    }
    const hint = sistemaFromContent(c);
    if (hint && (!men || d >= men.date)) men = { date: d, sistema: hint };
  }
  // Migração é ato oficial da unidade: prevalece sobre menções soltas posteriores.
  if (mig) return mig.sistema;
  return men?.sistema ?? null;
}


/** Wrapper público: resolve tribunal e enriquece com o sistema de tramitação eletrônica. */
export function tribunalFromCNJ(numero?: string | null, content?: string | null): TribunalInfo | null {
  const base = resolveTribunal(numero);
  if (!base) return null;
  const { sistema, alternativos } = sistemaFromSigla(base.sigla);
  const hint = sistemaFromContent(content);
  if (hint) {
    const alt = (alternativos ?? (sistema ? [sistema] : [])).filter((s) => s !== hint);
    return { ...base, sistema: hint, sistemasAlternativos: alt.length ? alt : undefined };
  }
  return { ...base, sistema, sistemasAlternativos: alternativos };
}


function resolveTribunal(numero?: string | null): TribunalInfo | null {
  if (!numero) return null;
  const digits = numero.replace(/\D/g, '');
  if (digits.length !== 20) return { sigla: '—', nome: 'Número CNJ inválido', segmento: '—', cnjValido: false };
  const J = digits.substring(13, 14);
  const TR = digits.substring(14, 16);

  switch (J) {
    case '1':
      return { sigla: 'STF', nome: 'Supremo Tribunal Federal', segmento: 'Tribunais Superiores', cnjValido: true };
    case '2':
      return { sigla: 'CNJ', nome: 'Conselho Nacional de Justiça', segmento: 'Órgão de Controle', cnjValido: true };
    case '3':
      return { sigla: 'STJ', nome: 'Superior Tribunal de Justiça', segmento: 'Tribunais Superiores', cnjValido: true };
    case '4': {
      // 90=TNU/CJF; 01..06=TRF1..TRF6
      if (TR === '90') return { sigla: 'CJF', nome: 'Conselho da Justiça Federal', segmento: 'Justiça Federal', cnjValido: true };
      const n = parseInt(TR, 10);
      if (n >= 1 && n <= 6) return { sigla: `TRF${n}`, nome: `Tribunal Regional Federal da ${n}ª Região`, segmento: 'Justiça Federal', cnjValido: true };
      return { sigla: 'JF', nome: 'Justiça Federal', segmento: 'Justiça Federal', cnjValido: true };
    }
    case '5': {
      if (TR === '90') return { sigla: 'TST', nome: 'Tribunal Superior do Trabalho', segmento: 'Justiça do Trabalho', cnjValido: true };
      const n = parseInt(TR, 10);
      if (n >= 1 && n <= 24) return { sigla: `TRT${TR}`, nome: `Tribunal Regional do Trabalho da ${n}ª Região`, segmento: 'Justiça do Trabalho', cnjValido: true };
      return { sigla: 'JT', nome: 'Justiça do Trabalho', segmento: 'Justiça do Trabalho', cnjValido: true };
    }
    case '6': {
      if (TR === '00') return { sigla: 'TSE', nome: 'Tribunal Superior Eleitoral', segmento: 'Justiça Eleitoral', cnjValido: true };
      const uf = UF_BY_CODE[TR];
      if (uf) return { sigla: `TRE-${uf}`, nome: `Tribunal Regional Eleitoral de ${uf}`, segmento: 'Justiça Eleitoral', uf, cnjValido: true };
      return { sigla: 'JE', nome: 'Justiça Eleitoral', segmento: 'Justiça Eleitoral', cnjValido: true };
    }
    case '7':
      return { sigla: 'STM', nome: 'Superior Tribunal Militar', segmento: 'Justiça Militar da União', cnjValido: true };
    case '8': {
      if (TR === '07') return { sigla: 'TJDFT', nome: 'Tribunal de Justiça do Distrito Federal e Territórios', segmento: 'Justiça Estadual', uf: 'DF', cnjValido: true };
      const uf = UF_BY_CODE[TR];
      if (uf) return { sigla: `TJ${uf}`, nome: `Tribunal de Justiça de ${uf}`, segmento: 'Justiça Estadual', uf, cnjValido: true };
      return { sigla: 'TJ', nome: 'Justiça Estadual', segmento: 'Justiça Estadual', cnjValido: true };
    }
    case '9': {
      const uf = UF_BY_CODE[TR];
      if (uf) return { sigla: `TJM-${uf}`, nome: `Tribunal de Justiça Militar de ${uf}`, segmento: 'Justiça Militar Estadual', uf, cnjValido: true };
      return { sigla: 'JME', nome: 'Justiça Militar Estadual', segmento: 'Justiça Militar Estadual', cnjValido: true };
    }
    default:
      return { sigla: '—', nome: 'Segmento desconhecido', segmento: '—', cnjValido: false };
  }
}

/**
 * Identifica a instância atual do processo conforme a publicação (órgão julgador
 * e/ou teor). Vale para qualquer tribunal brasileiro.
 */
export function instanciaFromContext(numero?: string | null, content?: string | null): string | null {
  const base = resolveTribunal(numero);
  if (base && ['STF', 'STJ', 'TST', 'TSE', 'STM'].includes(base.sigla)) return 'Instância Superior';
  const t = (content || '').toLowerCase();
  if (t) {
    if (/turma\s+recursal|col[eé]gio\s+recursal/.test(t)) return 'Turma Recursal';
    if (/\bc[âa]mara\b|\bturma\b|\bse[çc][ãa]o\b|desembargador|des\.?\s+fed|\brelator\b|\bgab\.?\s|ac[óo]rd[ãa]o|\bapela[çc][ãa]o\s+c[íi]vel\b/.test(t)) return '2º Grau';
    if (/\bvara\b|\bforo\b|juizado|\bof[íi]cio\b|comarca|\bsubse[çc][ãa]o\s+judici[áa]ria\b/.test(t)) return '1º Grau';
  }
  // Fallback universal pelo próprio CNJ: OOOO = unidade de origem.
  // 0000 identifica o próprio tribunal (competência originária/recursal).
  const digits = (numero || '').replace(/\D/g, '');
  if (digits.length === 20 && base?.cnjValido) {
    return digits.slice(16) === '0000' ? '2º Grau' : '1º Grau';
  }
  return null;
}
