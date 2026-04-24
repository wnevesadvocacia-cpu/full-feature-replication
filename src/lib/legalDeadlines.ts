// Detector de prazos processuais a partir do conteúdo de publicações/intimações.
// Regra geral: contagem em dias úteis (CPC art. 219), excluindo o dia do início
// e incluindo o dia do vencimento, com prorrogação para o próximo dia útil.
// Calendário CNJ aplicado via lib/cnjCalendar.ts (feriados nacionais + recesso 20/12-20/01).
//
// IMPORTANTE: Esta detecção é uma SUGESTÃO baseada em padrões textuais da praxis forense.
// O advogado responsável deve SEMPRE conferir o prazo no diploma processual aplicável
// e considerar peculiaridades (Fazenda Pública/MP/Defensoria em dobro - art. 183/186 CPC,
// litisconsortes com procuradores distintos - art. 229 CPC, etc).

import { isBusinessDay, nextBusinessDay } from './cnjCalendar';

export type DeadlineSource = 'CPC' | 'CPP' | 'CLT' | 'JEC' | 'JEF' | 'TST' | 'STF' | 'CTN' | 'desconhecido';
export type DeadlineUnit = 'dias_uteis' | 'dias_corridos';

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
}

interface Rule {
  /** Regex sobre o texto normalizado (lowercase, sem acentos, espaços simples) */
  pattern: RegExp;
  days: number;
  unit: DeadlineUnit;
  label: string;
  source: DeadlineSource;
  article: string;
}

// Ordem importa: regras mais específicas primeiro.
// Todas as regex devem rodar contra texto normalizado: minúsculas, sem acentos, espaços únicos.
const RULES: Rule[] = [
  // ===== Recursos cíveis (CPC) =====
  { pattern: /\bembargos? de declaracao\b/, days: 5, unit: 'dias_uteis', label: 'Embargos de Declaração', source: 'CPC', article: 'art. 1.023' },
  { pattern: /\bagravo (interno|regimental)\b/, days: 15, unit: 'dias_uteis', label: 'Agravo Interno', source: 'CPC', article: 'art. 1.021 §2º' },
  { pattern: /\bagravo de instrumento\b/, days: 15, unit: 'dias_uteis', label: 'Agravo de Instrumento', source: 'CPC', article: 'art. 1.003 §5º' },
  { pattern: /\bapelacao\b/, days: 15, unit: 'dias_uteis', label: 'Apelação', source: 'CPC', article: 'art. 1.003 §5º' },
  { pattern: /\brecurso (especial|extraordinario)\b/, days: 15, unit: 'dias_uteis', label: 'RE/REsp', source: 'CPC', article: 'art. 1.003 §5º' },
  { pattern: /\brecurso ordinario\b/, days: 15, unit: 'dias_uteis', label: 'Recurso Ordinário', source: 'CPC', article: 'art. 1.003 §5º' },
  { pattern: /\bcontrarrazoes\b/, days: 15, unit: 'dias_uteis', label: 'Contrarrazões', source: 'CPC', article: 'art. 1.010 §1º' },

  // ===== Atos postulatórios (CPC) =====
  { pattern: /\b(apresentar|oferecer|apresente|ofereca) contestacao\b/, days: 15, unit: 'dias_uteis', label: 'Contestação', source: 'CPC', article: 'art. 335' },
  { pattern: /\bcontestacao\b/, days: 15, unit: 'dias_uteis', label: 'Contestação', source: 'CPC', article: 'art. 335' },
  { pattern: /\breplica\b/, days: 15, unit: 'dias_uteis', label: 'Réplica', source: 'CPC', article: 'art. 350/351' },
  { pattern: /\bimpugnacao ao cumprimento de sentenca\b/, days: 15, unit: 'dias_uteis', label: 'Impugnação ao Cumprimento', source: 'CPC', article: 'art. 525' },
  { pattern: /\bembargos? a execucao\b/, days: 15, unit: 'dias_uteis', label: 'Embargos à Execução', source: 'CPC', article: 'art. 915' },
  { pattern: /\bcumprimento de sentenca\b.*\bpague\b|\bpague (?:em|no prazo de) 15\b/, days: 15, unit: 'dias_uteis', label: 'Pagamento Voluntário', source: 'CPC', article: 'art. 523' },
  { pattern: /\bespecificar provas\b/, days: 15, unit: 'dias_uteis', label: 'Especificação de Provas', source: 'CPC', article: 'art. 348' },
  { pattern: /\bmemoriais? (escritos|finais)\b/, days: 15, unit: 'dias_uteis', label: 'Memoriais', source: 'CPC', article: 'art. 364 §2º' },
  { pattern: /\bmanifeste(?:-se)? sobre (?:os )?(?:documentos|laudo|peticao)\b/, days: 15, unit: 'dias_uteis', label: 'Manifestação', source: 'CPC', article: 'art. 437 §1º' },
  { pattern: /\bmanifestacao sobre (?:o )?laudo (?:pericial)?\b/, days: 15, unit: 'dias_uteis', label: 'Manifestação Laudo', source: 'CPC', article: 'art. 477 §1º' },
  { pattern: /\bquesitos?\b.*\bperic/, days: 15, unit: 'dias_uteis', label: 'Quesitos Perícia', source: 'CPC', article: 'art. 465 §1º' },
  { pattern: /\bemende(?:-se)? a inicial\b|\bemenda a inicial\b/, days: 15, unit: 'dias_uteis', label: 'Emenda à Inicial', source: 'CPC', article: 'art. 321' },
  { pattern: /\b(custas|preparo) (recursais?|processuais?)\b/, days: 5, unit: 'dias_uteis', label: 'Recolhimento Custas', source: 'CPC', article: 'art. 290' },
  { pattern: /\b(?:no )?prazo de 5 (?:cinco )?dias\b/, days: 5, unit: 'dias_uteis', label: 'Manifestação (5 dias)', source: 'CPC', article: 'art. 218' },
  { pattern: /\b(?:no )?prazo de 10 (?:dez )?dias\b/, days: 10, unit: 'dias_uteis', label: 'Manifestação (10 dias)', source: 'CPC', article: 'art. 218' },
  { pattern: /\b(?:no )?prazo de 15 (?:quinze )?dias\b/, days: 15, unit: 'dias_uteis', label: 'Manifestação (15 dias)', source: 'CPC', article: 'art. 218' },
  { pattern: /\b(?:no )?prazo de 30 (?:trinta )?dias\b/, days: 30, unit: 'dias_uteis', label: 'Manifestação (30 dias)', source: 'CPC', article: 'art. 218' },

  // ===== Trabalhista (CLT) — prazos em dias úteis após Lei 13.467/17 =====
  { pattern: /\b(reclamacao trabalhista|defesa).*\b(audiencia|juizo)\b/, days: 5, unit: 'dias_uteis', label: 'Defesa Trabalhista', source: 'CLT', article: 'art. 847 CLT' },
  { pattern: /\brecurso ordinario.*trabalh/, days: 8, unit: 'dias_uteis', label: 'RO Trabalhista', source: 'CLT', article: 'art. 895 CLT' },
  { pattern: /\brecurso de revista\b/, days: 8, unit: 'dias_uteis', label: 'Recurso de Revista', source: 'TST', article: 'art. 896 §1º CLT' },
  { pattern: /\bagravo de peticao\b/, days: 8, unit: 'dias_uteis', label: 'Agravo de Petição', source: 'CLT', article: 'art. 897 a CLT' },
  { pattern: /\bembargos? (?:de )?(declaracao).*trabalh/, days: 5, unit: 'dias_uteis', label: 'EDcl Trabalhistas', source: 'CLT', article: 'art. 897-A CLT' },

  // ===== Penal (CPP) — em regra dias corridos =====
  { pattern: /\bresposta a acusacao\b/, days: 10, unit: 'dias_corridos', label: 'Resposta à Acusação', source: 'CPP', article: 'art. 396 CPP' },
  { pattern: /\balegacoes finais\b.*pena/, days: 5, unit: 'dias_corridos', label: 'Alegações Finais (Penal)', source: 'CPP', article: 'art. 403 §3º CPP' },
  { pattern: /\brecurso em sentido estrito\b/, days: 5, unit: 'dias_corridos', label: 'RESE', source: 'CPP', article: 'art. 586 CPP' },
  { pattern: /\bapelacao criminal\b/, days: 5, unit: 'dias_corridos', label: 'Apelação Criminal', source: 'CPP', article: 'art. 593 CPP' },
  { pattern: /\bhabeas corpus\b/, days: 0, unit: 'dias_corridos', label: 'Habeas Corpus (sem prazo)', source: 'CPP', article: 'art. 647 CPP' },

  // ===== Juizados Especiais (Lei 9.099/95 e 10.259/01) =====
  { pattern: /\brecurso inominado\b/, days: 10, unit: 'dias_uteis', label: 'Recurso Inominado', source: 'JEC', article: 'art. 42 Lei 9.099/95' },
  { pattern: /\bjuizado especial federal\b.*recurso/, days: 10, unit: 'dias_uteis', label: 'Recurso JEF', source: 'JEF', article: 'art. 5º Lei 10.259/01' },

  // ===== Tributário (CTN) =====
  { pattern: /\bimpugnacao (?:tribut|fiscal|ao auto de infracao)\b/, days: 30, unit: 'dias_corridos', label: 'Impugnação Fiscal', source: 'CTN', article: 'art. 15 Dec 70.235/72' },

  // ===== STF/STJ =====
  { pattern: /\bagravo em recurso (especial|extraordinario)\b/, days: 15, unit: 'dias_uteis', label: 'AREsp/ARE', source: 'STF', article: 'art. 1.042 CPC' },
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

// Detector explícito do número de dias quando texto traz "prazo de N dias"
const EXPLICIT_DAYS = /\bprazo (?:legal )?de (\d{1,3}) (?:dias?|dias? uteis|dias? corridos)\b/;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/<[^>]+>/g, ' ')        // remove tags HTML
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Adiciona N dias úteis a uma data ISO, respeitando o calendário CNJ.
 * Regra: o dia inicial NÃO conta (CPC art. 224). Vencimento em dia não-útil prorroga (art. 224 §1º).
 */
export function addBusinessDays(startISO: string, days: number): string {
  if (days <= 0) return startISO;
  let cursor = startISO;
  let count = 0;
  // Primeiro avança 1 dia útil (porque o dia da publicação/ciência não conta)
  cursor = nextBusinessDay(cursor);
  count = 1;
  while (count < days) {
    cursor = nextBusinessDay(cursor);
    count++;
  }
  // Garantia: se por algum motivo cair em dia não-útil, prorroga
  while (!isBusinessDay(cursor)) cursor = nextBusinessDay(cursor);
  return cursor;
}

/** Adiciona N dias corridos. Se vencer em dia não útil, prorroga (regra geral). */
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
  const guard = 3650; // 10 anos
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

/**
 * Detecta o prazo aplicável a partir do conteúdo da publicação e calcula o vencimento
 * a partir da data de disponibilização (received_at).
 *
 * Regra do CPC art. 224 §3º: considera-se data de PUBLICAÇÃO o primeiro dia útil seguinte
 * à disponibilização no DJE; o prazo COMEÇA A CONTAR no primeiro dia útil que se seguir
 * ao da publicação. Ou seja, do received_at até o início efetivo da contagem podemos ter
 * dois "saltos" para o próximo dia útil.
 */
export function detectDeadline(content: string, receivedAtISO: string, todayISO: string): DetectedDeadline | null {
  if (!content || !receivedAtISO) return null;
  const text = normalize(content);
  if (!text) return null;

  // 1) Match explícito "prazo de N dias" tem prioridade ALTA
  let chosen: { rule: Rule; matched: string } | null = null;
  const explicit = text.match(EXPLICIT_DAYS);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    if (n > 0 && n <= 180) {
      // Tenta refinar com label do contexto, senão usa rótulo genérico
      const ctxRule = RULES.find((r) => r.pattern.test(text) && r.days === n);
      chosen = {
        rule: ctxRule ?? {
          days: n,
          unit: 'dias_uteis',
          label: `Manifestação (${n} dias)`,
          source: 'CPC',
          article: 'art. 218 / texto da publicação',
          pattern: EXPLICIT_DAYS,
        },
        matched: explicit[0],
      };
    }
  }

  // 2) Caso contrário, varre regras na ordem de especificidade
  if (!chosen) {
    for (const rule of RULES) {
      const m = text.match(rule.pattern);
      if (m) { chosen = { rule, matched: m[0] }; break; }
    }
  }

  // 3) FALLBACK: regra geral CPC art. 218 §3º — quando a lei não fixar prazo,
  // os atos do juiz e da parte serão praticados em 5 dias.
  let isFallback = false;
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
      },
      matched: '(prazo não explícito — aplicada regra geral de 5 dias úteis)',
    };
  }

  const doubled = DOUBLE_PATTERNS.some((p) => p.test(text));
  const effectiveDays = doubled ? chosen.rule.days * 2 : chosen.rule.days;

  // CPC art. 224 §3º: publicação = 1º dia útil após disponibilização (received_at)
  // Início da contagem = 1º dia útil após a publicação
  let dueDate: string | null = null;
  let startDate: string | null = null;
  if (effectiveDays > 0) {
    const publicacao = nextBusinessDay(receivedAtISO);
    startDate = nextBusinessDay(publicacao); // 1º dia útil após publicação = início da contagem
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

  return {
    days: effectiveDays,
    unit: chosen.rule.unit,
    label: chosen.rule.label,
    source: chosen.rule.source,
    article: chosen.rule.article,
    matchedText: chosen.matched,
    doubled,
    dueDate,
    startDate,
    severity,
    businessDaysLeft,
    isFallback,
  };
}
