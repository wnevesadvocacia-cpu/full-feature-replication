// Detector de prazos processuais a partir do conteúdo de publicações/intimações.
// Regra geral: contagem em dias úteis (CPC art. 219), excluindo o dia do início
// e incluindo o dia do vencimento, com prorrogação para o próximo dia útil.
// Calendário CNJ aplicado via lib/cnjCalendar.ts (feriados nacionais + recesso 20/12-20/01).
//
// IMPORTANTE: Esta detecção é uma SUGESTÃO baseada em padrões textuais da praxis forense.
// O advogado responsável deve SEMPRE conferir o prazo no diploma processual aplicável
// e considerar peculiaridades (Fazenda Pública/MP/Defensoria em dobro - art. 183/186 CPC,
// litisconsortes com procuradores distintos - art. 229 CPC, etc).
//
// SPRINT JURÍDICO CRÍTICO (Item 1 — refactor com camada de contexto):
//   * REJEITO/ACOLHO embargos de declaração → reabre prazo do recurso original
//     (CPC art. 1.026 §1º) — NÃO é "embargos de declaração" novamente.
//   * SENTENÇA homologatória / extinção do feito → apelação (15 d.u.).
//   * Fazenda Pública / MP / Defensoria → prazo em dobro (CPC art. 183/186).
//   * Quando o tipo de decisão impugnada é ambíguo (ex.: REJEITO embargos sem dizer
//     se a base era sentença ou decisão interlocutória) → classificacao_status =
//     'ambigua_urgente' + sugestão dupla (apelação OU agravo de instrumento).
//   * Confiança < 0.8 → 'auto_baixa', UI deve mostrar badge âmbar e exigir revisão.

import { isBusinessDay, nextBusinessDay } from './cnjCalendar';

export type DeadlineSource = 'CPC' | 'CPP' | 'CLT' | 'JEC' | 'JEF' | 'TST' | 'STF' | 'CTN' | 'desconhecido';
export type DeadlineUnit = 'dias_uteis' | 'dias_corridos';

/** Status de classificação automática (espelha enum public.intimation_classification_status). */
export type ClassificationStatus =
  | 'auto_alta'
  | 'auto_media'
  | 'auto_baixa'
  | 'revisada_advogado'
  | 'ambigua_urgente';

/** Sugestão de peça processual cabível (estrutura JSONB salva no DB). */
export interface PecaSugerida {
  peca: string;
  fundamento_legal: string;
  prazo_dias: number;
  observacoes: string;
  /** Quando há ambiguidade (ex.: apelação OU agravo) — preenchido em ambigua_urgente. */
  peca_alternativa?: { peca: string; fundamento_legal: string; prazo_dias: number };
}

export interface DetectedDeadline {
  /** Quantidade base de dias prevista em lei */
  days: number;
  /** Unidade de contagem */
  unit: DeadlineUnit;
  /** Nome curto do ato (ex: "Contestação", "Apelação") */
  label: string;
  /** Diploma legal de origem */
  source: DeadlineSource;
  /** Artigo/dispositivo aplicado */
  article: string;
  /** Trecho do texto que disparou o match (para auditoria) */
  matchedText: string;
  /** Dobro do prazo? (Fazenda/MP/Defensoria) */
  doubled: boolean;
  /** Data de vencimento calculada (ISO YYYY-MM-DD) ou null se não foi possível */
  dueDate: string | null;
  /** Data inicial da contagem (1º dia útil após a publicação - CPC art. 224) */
  startDate: string | null;
  /** Severidade visual: critical (≤2 dias úteis), warning (≤5), normal (>5), expired */
  severity: 'expired' | 'critical' | 'warning' | 'normal';
  /** Dias úteis restantes até o vencimento (negativo = vencido) */
  businessDaysLeft: number;
  /** True quando o prazo foi inferido pela regra geral (5 dias - CPC art. 218 §3º) */
  isFallback: boolean;
  /** Peça processual sugerida (Sprint Jurídico). */
  pecaSugerida: PecaSugerida;
  /** Base legal completa para exibição (ex.: "CPC art. 1.026 §1º + 1.003 §5º"). */
  baseLegal: string;
  /** Score 0..1 de confiança da heurística. <0.8 ⇒ status auto_baixa/ambigua. */
  confianca: number;
  /** Classificação consolidada para o DB. */
  classificacaoStatus: ClassificationStatus;
}

interface Rule {
  /** Regex sobre o texto normalizado (lowercase, sem acentos, espaços simples) */
  pattern: RegExp;
  days: number;
  unit: DeadlineUnit;
  label: string;
  source: DeadlineSource;
  article: string;
  /** Sugestão de peça associada à regra. */
  peca: PecaSugerida;
  /** Confiança base desta regra (0..1). */
  confianca?: number;
}

// ====================================================================
// CAMADA DE CONTEXTO — detecta o que foi DECIDIDO antes de cair nas regex genéricas.
// Ordem CRÍTICA: contexto sempre vence regex de termo isolado.
// ====================================================================

/** Detecta rejeição/acolhimento de embargos de declaração — CPC art. 1.026 §1º. */
const REJEITA_EMBARGOS = /\b(rejeito|nao acolho|nao conheco|desacolho|indefiro|conheco e rejeito)\b[^.]{0,120}\bembargos? de declaracao\b/;
const ACOLHE_EMBARGOS  = /\b(acolho|recebo|conheco e acolho|dou provimento)\b[^.]{0,120}\bembargos? de declaracao\b/;

/** Detecta sentença (encerra fase cognitiva) vs decisão interlocutória. */
const TERMO_SENTENCA = /\b(sentenca|julgo (procedente|improcedente|parcialmente procedente|extinto)|extingo o (processo|feito)|homologo (o )?(acordo|transacao)|condeno|absolvo)\b/;
const TERMO_INTERLOCUTORIA = /\b(defiro|indefiro) (a )?(liminar|tutela|antecipacao)|\b(decido|despacho)\b/;

/** Sentença homologatória (acordo, transação, partilha) — apelação 15 d.u. (CPC 1.009). */
const SENTENCA_HOMOLOGATORIA = /\bhomologo (o )?(acordo|transacao|partilha|conciliacao|desistencia)\b/;

/** Condenação envolvendo Fazenda — prazos em dobro (CPC 183). */
const FAZENDA_NA_LIDE = /\b(condeno|determino) [^.]*\b(fazenda|uniao|estado de [a-z]+|municipio de [a-z]+|inss|autarquia)\b/;

// ====================================================================
// REGRAS BASE — após contexto, varre regras específicas → genéricas.
// ====================================================================

const PECA_APELACAO: PecaSugerida = {
  peca: 'Apelação Cível',
  fundamento_legal: 'CPC art. 1.009 c/c 1.003 §5º',
  prazo_dias: 15,
  observacoes: 'Recurso contra sentença. Verificar preparo (custas recursais) e capítulos impugnados.',
};

const PECA_AGRAVO_INSTR: PecaSugerida = {
  peca: 'Agravo de Instrumento',
  fundamento_legal: 'CPC art. 1.015 c/c 1.003 §5º',
  prazo_dias: 15,
  observacoes: 'Recurso contra decisão interlocutória nas hipóteses do art. 1.015. Exige peças obrigatórias (art. 1.017).',
};

const PECA_EMBARGOS_DECL: PecaSugerida = {
  peca: 'Embargos de Declaração',
  fundamento_legal: 'CPC art. 1.022/1.023',
  prazo_dias: 5,
  observacoes: 'Cabíveis para sanar omissão, contradição, obscuridade ou erro material.',
};

const PECA_CONTESTACAO: PecaSugerida = {
  peca: 'Contestação',
  fundamento_legal: 'CPC art. 335',
  prazo_dias: 15,
  observacoes: 'Apresentar todas as defesas (preliminares e mérito) sob pena de preclusão.',
};

const PECA_REPLICA: PecaSugerida = {
  peca: 'Réplica',
  fundamento_legal: 'CPC art. 350/351',
  prazo_dias: 15,
  observacoes: 'Manifestação sobre defesa do réu e documentos juntados.',
};

const PECA_CONTRARRAZOES: PecaSugerida = {
  peca: 'Contrarrazões',
  fundamento_legal: 'CPC art. 1.010 §1º',
  prazo_dias: 15,
  observacoes: 'Resposta ao recurso interposto pela parte contrária.',
};

const PECA_GENERICA = (label: string, dias: number): PecaSugerida => ({
  peca: label,
  fundamento_legal: 'CPC art. 218 §3º (regra geral) ou texto da publicação',
  prazo_dias: dias,
  observacoes: 'Verificar dispositivo legal específico citado no despacho.',
});

// Ordem importa: regras mais específicas primeiro.
// Todas as regex devem rodar contra texto normalizado: minúsculas, sem acentos, espaços únicos.
const RULES: Rule[] = [
  // ===== Recursos cíveis (CPC) =====
  { pattern: /\bembargos? de declaracao\b/, days: 5, unit: 'dias_uteis', label: 'Embargos de Declaração', source: 'CPC', article: 'art. 1.023', peca: PECA_EMBARGOS_DECL, confianca: 0.9 },
  { pattern: /\bagravo (interno|regimental)\b/, days: 15, unit: 'dias_uteis', label: 'Agravo Interno', source: 'CPC', article: 'art. 1.021 §2º', peca: { peca: 'Agravo Interno', fundamento_legal: 'CPC art. 1.021', prazo_dias: 15, observacoes: 'Recurso interno em órgão colegiado.' }, confianca: 0.9 },
  { pattern: /\bagravo de instrumento\b/, days: 15, unit: 'dias_uteis', label: 'Agravo de Instrumento', source: 'CPC', article: 'art. 1.003 §5º', peca: PECA_AGRAVO_INSTR, confianca: 0.9 },
  { pattern: /\bapelacao\b/, days: 15, unit: 'dias_uteis', label: 'Apelação', source: 'CPC', article: 'art. 1.003 §5º', peca: PECA_APELACAO, confianca: 0.9 },
  { pattern: /\brecurso (especial|extraordinario)\b/, days: 15, unit: 'dias_uteis', label: 'RE/REsp', source: 'CPC', article: 'art. 1.003 §5º', peca: { peca: 'Recurso Especial / Extraordinário', fundamento_legal: 'CPC art. 1.029', prazo_dias: 15, observacoes: 'Exige prequestionamento e demonstração de repercussão geral (RE).' }, confianca: 0.9 },
  { pattern: /\brecurso ordinario\b/, days: 15, unit: 'dias_uteis', label: 'Recurso Ordinário', source: 'CPC', article: 'art. 1.003 §5º', peca: { peca: 'Recurso Ordinário', fundamento_legal: 'CPC art. 1.027', prazo_dias: 15, observacoes: 'Recurso ordinário constitucional.' }, confianca: 0.85 },
  { pattern: /\bcontrarrazoes\b/, days: 15, unit: 'dias_uteis', label: 'Contrarrazões', source: 'CPC', article: 'art. 1.010 §1º', peca: PECA_CONTRARRAZOES, confianca: 0.9 },

  // ===== Atos postulatórios (CPC) =====
  { pattern: /\b(apresentar|oferecer|apresente|ofereca) contestacao\b/, days: 15, unit: 'dias_uteis', label: 'Contestação', source: 'CPC', article: 'art. 335', peca: PECA_CONTESTACAO, confianca: 0.92 },
  { pattern: /\bcontestacao\b/, days: 15, unit: 'dias_uteis', label: 'Contestação', source: 'CPC', article: 'art. 335', peca: PECA_CONTESTACAO, confianca: 0.85 },
  { pattern: /\breplica\b/, days: 15, unit: 'dias_uteis', label: 'Réplica', source: 'CPC', article: 'art. 350/351', peca: PECA_REPLICA, confianca: 0.85 },
  { pattern: /\bimpugnacao ao cumprimento de sentenca\b/, days: 15, unit: 'dias_uteis', label: 'Impugnação ao Cumprimento', source: 'CPC', article: 'art. 525', peca: { peca: 'Impugnação ao Cumprimento de Sentença', fundamento_legal: 'CPC art. 525', prazo_dias: 15, observacoes: 'Após o decurso do prazo de pagamento voluntário (15 d.u.).' }, confianca: 0.9 },
  { pattern: /\bembargos? a execucao\b/, days: 15, unit: 'dias_uteis', label: 'Embargos à Execução', source: 'CPC', article: 'art. 915', peca: { peca: 'Embargos à Execução', fundamento_legal: 'CPC art. 915', prazo_dias: 15, observacoes: 'Defesa típica em execução por título extrajudicial.' }, confianca: 0.9 },
  { pattern: /\bcumprimento de sentenca\b.*\bpague\b|\bpague (?:em|no prazo de) 15\b/, days: 15, unit: 'dias_uteis', label: 'Pagamento Voluntário', source: 'CPC', article: 'art. 523', peca: { peca: 'Petição de cumprimento (pagamento voluntário)', fundamento_legal: 'CPC art. 523', prazo_dias: 15, observacoes: 'Após este prazo incide multa de 10% e honorários de 10%.' }, confianca: 0.85 },
  { pattern: /\bespecificar provas\b/, days: 15, unit: 'dias_uteis', label: 'Especificação de Provas', source: 'CPC', article: 'art. 348', peca: PECA_GENERICA('Especificação de Provas', 15), confianca: 0.85 },
  { pattern: /\bmemoriais? (escritos|finais)\b/, days: 15, unit: 'dias_uteis', label: 'Memoriais', source: 'CPC', article: 'art. 364 §2º', peca: PECA_GENERICA('Memoriais Escritos', 15), confianca: 0.85 },
  { pattern: /\bmanifeste(?:-se)? sobre (?:os )?(?:documentos|laudo|peticao)\b/, days: 15, unit: 'dias_uteis', label: 'Manifestação', source: 'CPC', article: 'art. 437 §1º', peca: PECA_GENERICA('Manifestação', 15), confianca: 0.8 },
  { pattern: /\bmanifestacao sobre (?:o )?laudo (?:pericial)?\b/, days: 15, unit: 'dias_uteis', label: 'Manifestação Laudo', source: 'CPC', article: 'art. 477 §1º', peca: PECA_GENERICA('Manifestação sobre Laudo Pericial', 15), confianca: 0.85 },
  { pattern: /\bquesitos?\b.*\bperic/, days: 15, unit: 'dias_uteis', label: 'Quesitos Perícia', source: 'CPC', article: 'art. 465 §1º', peca: PECA_GENERICA('Quesitos para Perícia', 15), confianca: 0.85 },
  { pattern: /\bemende(?:-se)? a inicial\b|\bemenda a inicial\b/, days: 15, unit: 'dias_uteis', label: 'Emenda à Inicial', source: 'CPC', article: 'art. 321', peca: PECA_GENERICA('Emenda à Inicial', 15), confianca: 0.9 },
  { pattern: /\b(custas|preparo) (recursais?|processuais?)\b/, days: 5, unit: 'dias_uteis', label: 'Recolhimento Custas', source: 'CPC', article: 'art. 290', peca: PECA_GENERICA('Recolhimento de Custas', 5), confianca: 0.85 },
  { pattern: /\b(?:no )?prazo de (?:(?:5(?:\s*\(cinco\))?)|cinco) dias\b/, days: 5, unit: 'dias_uteis', label: 'Manifestação (5 dias)', source: 'CPC', article: 'art. 218', peca: PECA_GENERICA('Manifestação (5 dias)', 5), confianca: 0.7 },
  { pattern: /\b(?:no )?prazo de (?:(?:10(?:\s*\(dez\))?)|dez) dias\b/, days: 10, unit: 'dias_uteis', label: 'Manifestação (10 dias)', source: 'CPC', article: 'art. 218', peca: PECA_GENERICA('Manifestação (10 dias)', 10), confianca: 0.7 },
  { pattern: /\b(?:no )?prazo de (?:(?:15(?:\s*\(quinze\))?)|quinze) dias\b/, days: 15, unit: 'dias_uteis', label: 'Manifestação (15 dias)', source: 'CPC', article: 'art. 218', peca: PECA_GENERICA('Manifestação (15 dias)', 15), confianca: 0.7 },
  { pattern: /\b(?:no )?prazo de (?:(?:30(?:\s*\(trinta\))?)|trinta) dias\b/, days: 30, unit: 'dias_uteis', label: 'Manifestação (30 dias)', source: 'CPC', article: 'art. 218', peca: PECA_GENERICA('Manifestação (30 dias)', 30), confianca: 0.7 },

  // ===== Trabalhista (CLT) =====
  { pattern: /\b(reclamacao trabalhista|defesa).*\b(audiencia|juizo)\b/, days: 5, unit: 'dias_uteis', label: 'Defesa Trabalhista', source: 'CLT', article: 'art. 847 CLT', peca: { peca: 'Defesa Trabalhista', fundamento_legal: 'CLT art. 847', prazo_dias: 5, observacoes: 'Apresentar até 20 minutos após a abertura da audiência (escrita ou oral).' }, confianca: 0.85 },
  { pattern: /\brecurso ordinario.*trabalh/, days: 8, unit: 'dias_uteis', label: 'RO Trabalhista', source: 'CLT', article: 'art. 895 CLT', peca: { peca: 'Recurso Ordinário Trabalhista', fundamento_legal: 'CLT art. 895', prazo_dias: 8, observacoes: 'Prazo em dias úteis pós Lei 13.467/17.' }, confianca: 0.9 },
  { pattern: /\brecurso de revista\b/, days: 8, unit: 'dias_uteis', label: 'Recurso de Revista', source: 'TST', article: 'art. 896 §1º CLT', peca: { peca: 'Recurso de Revista', fundamento_legal: 'CLT art. 896', prazo_dias: 8, observacoes: 'Exige transcendência (art. 896-A).' }, confianca: 0.9 },
  { pattern: /\bagravo de peticao\b/, days: 8, unit: 'dias_uteis', label: 'Agravo de Petição', source: 'CLT', article: 'art. 897 a CLT', peca: { peca: 'Agravo de Petição', fundamento_legal: 'CLT art. 897, a', prazo_dias: 8, observacoes: 'Recurso na fase de execução trabalhista.' }, confianca: 0.9 },
  { pattern: /\bembargos? (?:de )?(declaracao).*trabalh/, days: 5, unit: 'dias_uteis', label: 'EDcl Trabalhistas', source: 'CLT', article: 'art. 897-A CLT', peca: { peca: 'Embargos de Declaração Trabalhistas', fundamento_legal: 'CLT art. 897-A', prazo_dias: 5, observacoes: 'Cabíveis para sanar omissão/contradição/obscuridade.' }, confianca: 0.85 },

  // ===== Penal (CPP) =====
  { pattern: /\bresposta a acusacao\b/, days: 10, unit: 'dias_corridos', label: 'Resposta à Acusação', source: 'CPP', article: 'art. 396 CPP', peca: { peca: 'Resposta à Acusação', fundamento_legal: 'CPP art. 396', prazo_dias: 10, observacoes: 'Fase inicial; pode arguir preliminares e produção de provas.' }, confianca: 0.9 },
  { pattern: /\balegacoes finais\b.*pena/, days: 5, unit: 'dias_corridos', label: 'Alegações Finais (Penal)', source: 'CPP', article: 'art. 403 §3º CPP', peca: { peca: 'Alegações Finais', fundamento_legal: 'CPP art. 403 §3º', prazo_dias: 5, observacoes: 'Em casos de complexidade ou pluralidade de réus.' }, confianca: 0.85 },
  { pattern: /\brecurso em sentido estrito\b/, days: 5, unit: 'dias_corridos', label: 'RESE', source: 'CPP', article: 'art. 586 CPP', peca: { peca: 'Recurso em Sentido Estrito', fundamento_legal: 'CPP art. 586', prazo_dias: 5, observacoes: 'Hipóteses taxativas do art. 581.' }, confianca: 0.9 },
  { pattern: /\bapelacao criminal\b/, days: 5, unit: 'dias_corridos', label: 'Apelação Criminal', source: 'CPP', article: 'art. 593 CPP', peca: { peca: 'Apelação Criminal', fundamento_legal: 'CPP art. 593', prazo_dias: 5, observacoes: 'Razões em 8 dias após interposição.' }, confianca: 0.9 },
  { pattern: /\bhabeas corpus\b/, days: 0, unit: 'dias_corridos', label: 'Habeas Corpus (sem prazo)', source: 'CPP', article: 'art. 647 CPP', peca: { peca: 'Habeas Corpus', fundamento_legal: 'CPP art. 647', prazo_dias: 0, observacoes: 'Sem prazo decadencial.' }, confianca: 0.7 },

  // ===== Juizados Especiais =====
  { pattern: /\brecurso inominado\b/, days: 10, unit: 'dias_uteis', label: 'Recurso Inominado', source: 'JEC', article: 'art. 42 Lei 9.099/95', peca: { peca: 'Recurso Inominado', fundamento_legal: 'Lei 9.099/95 art. 42', prazo_dias: 10, observacoes: 'JEC. Preparo em 48h após interposição.' }, confianca: 0.9 },
  { pattern: /\bjuizado especial federal\b.*recurso/, days: 10, unit: 'dias_uteis', label: 'Recurso JEF', source: 'JEF', article: 'art. 5º Lei 10.259/01', peca: { peca: 'Recurso JEF', fundamento_legal: 'Lei 10.259/01 art. 5º', prazo_dias: 10, observacoes: 'JEF.' }, confianca: 0.9 },

  // ===== Tributário =====
  { pattern: /\bimpugnacao (?:tribut|fiscal|ao auto de infracao)\b/, days: 30, unit: 'dias_corridos', label: 'Impugnação Fiscal', source: 'CTN', article: 'art. 15 Dec 70.235/72', peca: { peca: 'Impugnação Fiscal', fundamento_legal: 'Decreto 70.235/72 art. 15', prazo_dias: 30, observacoes: 'Processo administrativo fiscal federal.' }, confianca: 0.85 },

  // ===== STF/STJ =====
  { pattern: /\bagravo em recurso (especial|extraordinario)\b/, days: 15, unit: 'dias_uteis', label: 'AREsp/ARE', source: 'STF', article: 'art. 1.042 CPC', peca: { peca: 'Agravo em Recurso Especial/Extraordinário', fundamento_legal: 'CPC art. 1.042', prazo_dias: 15, observacoes: 'Contra decisão denegatória de RE/REsp.' }, confianca: 0.9 },
];

// Detectores de prazo em dobro (Fazenda Pública, MP, Defensoria)
const DOUBLE_PATTERNS = [
  /\bfazenda publica\b/,
  /\buniao\b(?!\s+europeia)/,
  /\bestado de\b/,
  /\bmunicipio de\b/,
  /\bautarquia\b/,
  /\bministerio publico\b/,
  /\bdefensoria publica\b/,
  /\binss\b/,
  /\bcaixa economica federal\b/,
];

// Detector explícito do número de dias.
const NUM_BY_EXTENSO: Record<string, number> = {
  'um': 1, 'dois': 2, 'tres': 3, 'quatro': 4, 'cinco': 5, 'seis': 6, 'sete': 7,
  'oito': 8, 'nove': 9, 'dez': 10, 'onze': 11, 'doze': 12, 'treze': 13,
  'quatorze': 14, 'catorze': 14, 'quinze': 15, 'dezesseis': 16, 'dezessete': 17,
  'dezoito': 18, 'dezenove': 19, 'vinte': 20, 'trinta': 30, 'quarenta': 40,
  'cinquenta': 50, 'sessenta': 60, 'setenta': 70, 'oitenta': 80, 'noventa': 90,
  'cem': 100, 'cento e vinte': 120, 'cento e oitenta': 180,
};
const EXTENSO_RX = Object.keys(NUM_BY_EXTENSO)
  .sort((a, b) => b.length - a.length)
  .join('|');
const TRIGGER = '(?:no\\s+)?(?:dentro\\s+(?:do\\s+)?)?prazo(?:\\s+legal)?\\s+de|dentro\\s+de|em\\s+ate|no\\s+decendio\\s+de|no\\s+quinquenio\\s+de';
const EXPLICIT_DAYS = new RegExp(
  `\\b(?:${TRIGGER})\\s+(?:(\\d{1,3})(?:\\s*\\([^)]+\\))?|(${EXTENSO_RX})(?:\\s*\\(\\d{1,3}\\))?)\\s+dias?(?:\\s+(uteis|corridos))?\\b`,
);

// ====================================================================
// PARSER LITERAL DE PRAZO — P0 #3 (prevalece sobre classificador/contexto).
// Cobre formatos da praxis forense que o EXPLICIT_DAYS não pegava:
//   "Prazo: 5 (cinco) dias"   "Prazo - 10 dias"   "PRAZO: 15 dias"
//   "preparo recursal em 5 (cinco) dias, sob pena de deserção"
//   "recolha o preparo em 5 dias"   "junte em 10 dias"
//   "no prazo de quinze (15) dias"  "em quinze dias"
// ====================================================================
const LITERAL_TRIGGERS_PRE = [
  // "prazo:" / "prazo -" / "prazo de"
  '(?:no\\s+)?prazo(?:\\s+legal)?\\s*(?:[:\\-–]|de)\\s*',
  // "dentro do prazo de"
  'dentro\\s+(?:do\\s+)?prazo\\s+de\\s*',
  // ações que costumam vir com "em N dias" sob pena de algo
  '(?:preparo\\s+\\w+|recolh[a-z]+|comprov[a-z]+|protocol[a-z]+|junt[a-z]+|manifest[a-z]+|cumpr[a-z]+|apresent[a-z]+|emend[a-z]+|recolha\\s+o\\s+preparo)[^.;\\n]{0,60}?\\bem\\s+',
  // "em ate N dias"
  'em\\s+ate\\s+',
].join('|');

const LITERAL_NUM = `(?:(\\d{1,3})(?:\\s*\\([^)]+\\))?|(${EXTENSO_RX})(?:\\s*\\(\\d{1,3}\\))?)`;
const LITERAL_DEADLINE_RX = new RegExp(
  `(?:${LITERAL_TRIGGERS_PRE})\\s*${LITERAL_NUM}\\s+dias?(?:\\s+(uteis|corridos))?`,
);

interface LiteralMatch { days: number; unit: DeadlineUnit; matched: string; }

function extractLiteralDeadline(normText: string): LiteralMatch | null {
  const m = normText.match(LITERAL_DEADLINE_RX);
  if (!m) return null;
  const n = m[1] ? parseInt(m[1], 10) : (m[2] ? NUM_BY_EXTENSO[m[2]] ?? 0 : 0);
  if (!n || n > 365) return null;
  const unit: DeadlineUnit = m[3] === 'corridos' ? 'dias_corridos' : 'dias_uteis';
  return { days: n, unit, matched: m[0] };
}

// ====================================================================
// PAUTA DE SESSÃO VIRTUAL — P0 #2 (Resolução CNJ 591/24, TJSP 984/2025).
// Vencimento = 48h ANTES da data da sessão (janela de destaque/sustentação oral).
//
// TODO P1.5 (ref. conversa 2026-05-11): Res. CNJ 591/24 art. 9º fala em "48 horas"
// corridas a partir do HORÁRIO da sessão, não em "2 dias corridos com recuo p/ útil".
// O cálculo abaixo coincide com 48h-corridas em todos os 5 casos auditados (05–11/05/2026)
// porque sessões diurnas + recuo de fim-de-semana convergem. Mas é frágil:
// - Perde a hora da sessão no card (usuário pode achar que tem o dia útil inteiro)
// - Sessões matutinas têm prazo real até hh:mm do dia útil anterior, não 23:59
// Solução completa: persistir `session_datetime timestamptz` em intimations,
// calcular `due = session_datetime - interval '48h'` e exibir hora no card.
// ====================================================================
const PAUTA_VIRTUAL_RX = /\b(data da pauta|sessao de julgamento|processo pautado|sessao virtual|resolucao\s+(?:cnj\s+)?591|pautado para (?:a )?sessao)\b/;
const SESSION_DATE_RX = /\b(\d{2})\/(\d{2})\/(\d{4})(?:[\s,]+(?:as\s+)?(\d{1,2})[h:](\d{2}))?/;

interface PautaMatch { sessionISO: string; sessionTime: string | null; matched: string; }

function extractPautaSessao(normText: string): PautaMatch | null {
  if (!PAUTA_VIRTUAL_RX.test(normText)) return null;
  // Busca primeira data DD/MM/AAAA próxima do gatilho ou no texto inteiro
  const dm = normText.match(SESSION_DATE_RX);
  if (!dm) return null;
  const [, dd, mm, yyyy, hh, mi] = dm;
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  const time = hh ? `${hh.padStart(2, '0')}:${mi}` : null;
  return { sessionISO: iso, sessionTime: time, matched: dm[0] };
}

/** Subtrai N dias corridos de uma data ISO; recua para dia útil anterior se cair em não-útil. */
function subCalendarDaysToBusiness(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  let out = d.toISOString().slice(0, 10);
  // recua para dia útil anterior (não pode passar para depois da sessão)
  while (!isBusinessDay(out)) {
    const x = new Date(out + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1);
    out = x.toISOString().slice(0, 10);
  }
  return out;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** Adiciona N dias úteis a uma data ISO. CPC art. 224: dia inicial não conta. */
export function addBusinessDays(startISO: string, days: number): string {
  if (days <= 0) return startISO;
  let cursor = startISO;
  let count = 0;
  cursor = nextBusinessDay(cursor);
  count = 1;
  while (count < days) {
    cursor = nextBusinessDay(cursor);
    count++;
  }
  while (!isBusinessDay(cursor)) cursor = nextBusinessDay(cursor);
  return cursor;
}

/** Adiciona N dias corridos com prorrogação se cair em dia não-útil. */
export function addCalendarDays(startISO: string, days: number): string {
  const d = new Date(startISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  let iso = d.toISOString().slice(0, 10);
  while (!isBusinessDay(iso)) iso = nextBusinessDay(iso);
  return iso;
}

/** Conta dias úteis entre duas datas ISO (positivo se end > start). */
export function businessDaysBetween(startISO: string, endISO: string): number {
  if (startISO === endISO) return 0;
  const sign = endISO > startISO ? 1 : -1;
  let cursor = startISO;
  let count = 0;
  const guard = 3650;
  let i = 0;
  while (cursor !== endISO && i++ < guard) {
    cursor = sign > 0 ? nextBusinessDay(cursor) : prevBusinessDay(cursor);
    count += sign;
  }
  return count;
}

function prevBusinessDay(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  do { d.setUTCDate(d.getUTCDate() - 1); } while (!isBusinessDay(d.toISOString().slice(0, 10)));
  return d.toISOString().slice(0, 10);
}

/** Mapeia score de confiança em status do DB. */
function scoreToStatus(c: number): ClassificationStatus {
  if (c >= 0.9) return 'auto_alta';
  if (c >= 0.8) return 'auto_media';
  return 'auto_baixa';
}

/**
 * Detecta o prazo aplicável a partir do conteúdo da publicação e calcula o vencimento
 * a partir da data de disponibilização (received_at).
 *
 * Regra do CPC art. 224 §3º: considera-se data de PUBLICAÇÃO o primeiro dia útil seguinte
 * à disponibilização no DJE; o prazo COMEÇA A CONTAR no primeiro dia útil que se seguir
 * ao da publicação.
 */
export function detectDeadline(content: string, receivedAtISO: string, todayISO: string): DetectedDeadline | null {
  if (!content || !receivedAtISO) return null;
  const text = normalize(content);
  if (!text) return null;

  let chosen: { rule: Rule; matched: string } | null = null;
  let isFallback = false;
  let confianca = 0.5;
  let classificacaoStatus: ClassificationStatus = 'auto_media';
  let pecaSugerida: PecaSugerida | null = null;
  let baseLegalExtra = '';

  // ====== P0 #2: PAUTA DE SESSÃO VIRTUAL (precedência ABSOLUTA) ======
  // Vencimento = 48h antes da sessão (Res. CNJ 591/24, TJSP 984/2025).
  // Trava de segurança: dueDate NUNCA pode ser >= sessionDate.
  const pauta = extractPautaSessao(text);
  if (pauta && pauta.sessionISO > receivedAtISO) {
    const dueDate = subCalendarDaysToBusiness(pauta.sessionISO, 2);
    // Hard guard: se cálculo deu data >= sessão, força para 1 dia útil antes
    let safeDueDate = dueDate;
    if (safeDueDate >= pauta.sessionISO) {
      const x = new Date(pauta.sessionISO + 'T12:00:00Z');
      x.setUTCDate(x.getUTCDate() - 1);
      safeDueDate = x.toISOString().slice(0, 10);
      while (!isBusinessDay(safeDueDate) || safeDueDate >= pauta.sessionISO) {
        const y = new Date(safeDueDate + 'T12:00:00Z'); y.setUTCDate(y.getUTCDate() - 1);
        safeDueDate = y.toISOString().slice(0, 10);
      }
    }
    const bdLeft = businessDaysBetween(todayISO, safeDueDate);
    const sev: DetectedDeadline['severity'] =
      bdLeft < 0 ? 'expired' : bdLeft <= 2 ? 'critical' : bdLeft <= 5 ? 'warning' : 'normal';
    const timeLabel = pauta.sessionTime ? ` às ${pauta.sessionTime}` : '';
    return {
      days: 0,
      unit: 'dias_corridos',
      label: `Pauta sessão virtual — sessão ${pauta.sessionISO.slice(8,10)}/${pauta.sessionISO.slice(5,7)}${timeLabel}`,
      source: 'CPC',
      article: 'Res. CNJ 591/2024 art. 9º + TJSP 984/2025',
      matchedText: pauta.matched,
      doubled: false,
      dueDate: safeDueDate,
      startDate: receivedAtISO,
      severity: sev,
      businessDaysLeft: bdLeft,
      isFallback: false,
      pecaSugerida: {
        peca: 'Pedido de sustentação oral / destaque',
        fundamento_legal: 'Res. CNJ 591/2024 art. 9º',
        prazo_dias: 2,
        observacoes: `Sessão de julgamento virtual em ${pauta.sessionISO.slice(8,10)}/${pauta.sessionISO.slice(5,7)}/${pauta.sessionISO.slice(0,4)}${timeLabel}. Janela para destaque/sustentação oral encerra 48h antes.`,
      },
      baseLegal: `Res. CNJ 591/2024 (sessão virtual) — janela de destaque até 48h antes da sessão`,
      confianca: 0.92,
      classificacaoStatus: 'auto_alta',
    };
  }

  // ====== P0 #3: PARSER LITERAL DE PRAZO (prevalece sobre classificador) ======
  const literal = extractLiteralDeadline(text);
  if (literal) {
    chosen = {
      rule: {
        pattern: LITERAL_DEADLINE_RX,
        days: literal.days,
        unit: literal.unit,
        label: `Manifestação (${literal.days} ${literal.unit === 'dias_corridos' ? 'dias corridos' : 'dias'})`,
        source: 'CPC',
        article: 'art. 218 / texto da publicação',
        peca: PECA_GENERICA(`Manifestação (${literal.days} dias)`, literal.days),
      },
      matched: literal.matched,
    };
    confianca = 0.95;
    classificacaoStatus = 'auto_alta';
  }


  // (A) REJEITO embargos de declaração → reabre prazo recurso original (CPC 1.026 §1º)
  const mRejeita = text.match(REJEITA_EMBARGOS);
  if (mRejeita) {
    const isSentenca = TERMO_SENTENCA.test(text);
    const isInterloc = TERMO_INTERLOCUTORIA.test(text);
    if (isSentenca && !isInterloc) {
      // Pista forte de sentença → apelação 15 d.u.
      chosen = {
        rule: { pattern: REJEITA_EMBARGOS, days: 15, unit: 'dias_uteis', label: 'Apelação (reaberta após rejeição de EDcl)', source: 'CPC', article: 'art. 1.026 §1º + 1.003 §5º + 1.009', peca: PECA_APELACAO },
        matched: mRejeita[0],
      };
      confianca = 0.85;
      classificacaoStatus = 'auto_media';
      pecaSugerida = { ...PECA_APELACAO, observacoes: 'Embargos de declaração foram REJEITADOS. Prazo do recurso original (apelação) foi REABERTO — CPC art. 1.026 §1º. Conferir natureza da decisão embargada.' };
      baseLegalExtra = 'CPC art. 1.026 §1º (rejeição de EDcl reabre prazo recursal)';
    } else if (isInterloc && !isSentenca) {
      chosen = {
        rule: { pattern: REJEITA_EMBARGOS, days: 15, unit: 'dias_uteis', label: 'Agravo de Instrumento (reaberto após rejeição de EDcl)', source: 'CPC', article: 'art. 1.026 §1º + 1.015', peca: PECA_AGRAVO_INSTR },
        matched: mRejeita[0],
      };
      confianca = 0.82;
      classificacaoStatus = 'auto_media';
      pecaSugerida = { ...PECA_AGRAVO_INSTR, observacoes: 'EDcl rejeitados. Prazo do AI reaberto — CPC art. 1.026 §1º. Verificar se a decisão embargada está no rol do art. 1.015.' };
      baseLegalExtra = 'CPC art. 1.026 §1º (rejeição de EDcl reabre prazo recursal)';
    } else {
      // AMBÍGUO: não dá para distinguir sentença vs interlocutória pelo texto
      chosen = {
        rule: { pattern: REJEITA_EMBARGOS, days: 15, unit: 'dias_uteis', label: 'Recurso (apelação OU agravo) — ambíguo', source: 'CPC', article: 'art. 1.026 §1º', peca: PECA_APELACAO },
        matched: mRejeita[0],
      };
      confianca = 0.55;
      classificacaoStatus = 'ambigua_urgente';
      pecaSugerida = {
        peca: 'Apelação Cível (presumido)',
        fundamento_legal: 'CPC art. 1.009 c/c 1.003 §5º + 1.026 §1º',
        prazo_dias: 15,
        observacoes: '⚠ AMBÍGUO: rejeição de embargos de declaração reabre o prazo do recurso original (CPC 1.026 §1º), mas o texto não esclarece se a decisão embargada era SENTENÇA (→ Apelação) ou DECISÃO INTERLOCUTÓRIA (→ Agravo de Instrumento). ADVOGADO DEVE CONFIRMAR antes de protocolar.',
        peca_alternativa: { peca: 'Agravo de Instrumento', fundamento_legal: 'CPC art. 1.015 c/c 1.026 §1º', prazo_dias: 15 },
      };
      baseLegalExtra = 'CPC art. 1.026 §1º (rejeição de EDcl reabre prazo recursal — natureza recursal a confirmar)';
    }
  }

  // (B) ACOLHE embargos de declaração → também reabre prazo (CPC 1.026 §1º)
  if (!chosen) {
    const mAcolhe = text.match(ACOLHE_EMBARGOS);
    if (mAcolhe) {
      chosen = {
        rule: { pattern: ACOLHE_EMBARGOS, days: 15, unit: 'dias_uteis', label: 'Recurso (após acolhimento de EDcl)', source: 'CPC', article: 'art. 1.026 §1º', peca: PECA_APELACAO },
        matched: mAcolhe[0],
      };
      confianca = 0.65;
      classificacaoStatus = 'ambigua_urgente';
      pecaSugerida = {
        peca: 'Recurso a definir (presumido: Apelação)',
        fundamento_legal: 'CPC art. 1.026 §1º',
        prazo_dias: 15,
        observacoes: '⚠ EDcl ACOLHIDOS. Se houve modificação substancial, abre novo prazo recursal. Conferir se a decisão embargada era sentença (Apelação) ou interlocutória (Agravo).',
        peca_alternativa: { peca: 'Agravo de Instrumento', fundamento_legal: 'CPC art. 1.015 c/c 1.026 §1º', prazo_dias: 15 },
      };
      baseLegalExtra = 'CPC art. 1.026 §1º (acolhimento de EDcl com efeito modificativo reabre prazo)';
    }
  }

  // (C) Sentença homologatória → apelação 15 d.u.
  if (!chosen) {
    const mHomolog = text.match(SENTENCA_HOMOLOGATORIA);
    if (mHomolog) {
      chosen = {
        rule: { pattern: SENTENCA_HOMOLOGATORIA, days: 15, unit: 'dias_uteis', label: 'Apelação (sentença homologatória)', source: 'CPC', article: 'art. 1.009 c/c 1.003 §5º', peca: PECA_APELACAO },
        matched: mHomolog[0],
      };
      confianca = 0.88;
      classificacaoStatus = 'auto_media';
      pecaSugerida = { ...PECA_APELACAO, observacoes: 'Sentença homologatória (acordo/transação/partilha) → cabe apelação se houver interesse recursal.' };
      baseLegalExtra = 'Sentença homologatória (CPC art. 487, III)';
    }
  }

  // ====== CAMADA EXPLÍCITA: "prazo de N dias" tem alta prioridade quando contexto não venceu ======
  if (!chosen) {
    const explicit = text.match(EXPLICIT_DAYS);
    if (explicit) {
      const n = explicit[1]
        ? parseInt(explicit[1], 10)
        : (explicit[2] ? NUM_BY_EXTENSO[explicit[2]] ?? 0 : 0);
      const explicitUnit: DeadlineUnit = explicit[3] === 'corridos' ? 'dias_corridos' : 'dias_uteis';
      if (n > 0 && n <= 180) {
        const ctxRule = RULES.find((r) => r.pattern.test(text) && r.days === n && r.unit === explicitUnit);
        chosen = {
          rule: ctxRule ?? {
            days: n,
            unit: explicitUnit,
            label: `Manifestação (${n} ${explicitUnit === 'dias_corridos' ? 'dias corridos' : 'dias'})`,
            source: 'CPC',
            article: 'art. 218 / texto da publicação',
            pattern: EXPLICIT_DAYS,
            peca: PECA_GENERICA(`Manifestação (${n} dias)`, n),
          },
          matched: explicit[0],
        };
        confianca = ctxRule?.confianca ?? 0.78;
      }
    }
  }

  // ====== CAMADA REGEX (regras específicas → genéricas) ======
  if (!chosen) {
    for (const rule of RULES) {
      const m = text.match(rule.pattern);
      if (m) { chosen = { rule, matched: m[0] }; confianca = rule.confianca ?? 0.8; break; }
    }
  }

  // ====== FALLBACK CPC 218 §3º (5 dias úteis) ======
  if (!chosen) {
    isFallback = true;
    chosen = {
      rule: {
        days: 5,
        unit: 'dias_uteis',
        label: 'Manifestação (regra geral)',
        source: 'CPC',
        article: 'art. 218 §3º (regra supletiva 5 dias)',
        pattern: /.*/,
        peca: PECA_GENERICA('Manifestação (regra geral)', 5),
      },
      matched: '(prazo não explícito — aplicada regra geral de 5 dias úteis)',
    };
    confianca = 0.5;
    classificacaoStatus = 'auto_baixa';
  }

  if (!pecaSugerida) pecaSugerida = chosen.rule.peca;

  const doubled = DOUBLE_PATTERNS.some((p) => p.test(text));
  const fazendaCondenada = FAZENDA_NA_LIDE.test(text);
  const effectiveDays = (doubled || fazendaCondenada) ? chosen.rule.days * 2 : chosen.rule.days;

  // CPC art. 224 §3º
  let dueDate: string | null = null;
  let startDate: string | null = null;
  if (effectiveDays > 0) {
    const publicacao = nextBusinessDay(receivedAtISO);
    startDate = nextBusinessDay(publicacao);
    dueDate = chosen.rule.unit === 'dias_uteis'
      ? addBusinessDays(publicacao, effectiveDays)
      : addCalendarDays(publicacao, effectiveDays);
  }

  let businessDaysLeft = 0;
  let severity: DetectedDeadline['severity'] = 'normal';
  if (dueDate) {
    businessDaysLeft = businessDaysBetween(todayISO, dueDate);
    if (businessDaysLeft < 0) severity = 'expired';
    else if (businessDaysLeft <= 2) severity = 'critical';
    else if (businessDaysLeft <= 5) severity = 'warning';
    else severity = 'normal';
  }

  // Se contexto não definiu, derivar do score
  if (classificacaoStatus === 'auto_media' && confianca >= 0.9) classificacaoStatus = 'auto_alta';
  else if (classificacaoStatus === 'auto_media' && confianca < 0.8) classificacaoStatus = 'auto_baixa';
  else if (classificacaoStatus === 'auto_media') classificacaoStatus = scoreToStatus(confianca);

  const baseLegal = [`${chosen.rule.source} ${chosen.rule.article}`, baseLegalExtra]
    .filter(Boolean)
    .join(' · ');

  return {
    days: effectiveDays,
    unit: chosen.rule.unit,
    label: chosen.rule.label,
    source: chosen.rule.source,
    article: chosen.rule.article,
    matchedText: chosen.matched,
    doubled: doubled || fazendaCondenada,
    dueDate,
    startDate,
    severity,
    businessDaysLeft,
    isFallback,
    pecaSugerida,
    baseLegal,
    confianca: Math.round(confianca * 100) / 100,
    classificacaoStatus,
  };
}
