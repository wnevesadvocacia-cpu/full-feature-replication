import { deadlineRecipient, recipientDirectives } from './deadlineRecipient';

interface Suggestion {
  days: number;
  unit: string;
  source?: string;
  dueDate: string | null;
  startDate: string | null;
  isFallback: boolean;
  triggerSource: string;
  classificacaoStatus: string;
  pecaSugerida: { peca: string; prazo_dias: number; peca_alternativa?: unknown };
}
export interface SuggestionReview {
  version: 1;
  approved: boolean;
  checks: { stage: 'command' | 'recipient_deadline' | 'conflict'; passed: boolean; reason: string }[];
}
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(em\)/g, 'em').replace(/\(s\)/g, 's').replace(/\s+/g, ' ');
const actions = [
  ['contraminuta', /\b(?:para|apresentar(?:em)?|oferecer(?:em)?)\b[^.;]{0,60}\bcontraminutas?\b/],
  ['contrarrazoes', /\b(?:para|apresentar(?:em)?|oferecer(?:em)?)\b[^.;]{0,60}\bcontrarrazoes\b/],
  ['contestacao', /\bpara\s+(?:contestar|apresentar\s+contestacao)\b/],
  ['manifestacao', /\b(?:manifeste[m]?[ -]se|para\s+(?:manifestacao|manifestar(?:[ -]se)?))\b/],
  ['emenda', /\bpara\s+emendar\b/],
  ['pagamento', /\b(?:para\s+pagar|efetue[m]?\s+o\s+pagamento)\b/],
] as const;

/** Three distinct deterministic checks, not three independent legal opinions.
 * Agreement authorizes an option, never filing or a zero-risk guarantee. */
export function reviewTaskSuggestion(content: string, suggestion: Suggestion | null): SuggestionReview {
  if (!suggestion) return {
    version: 1, approved: false,
    checks: ['command', 'recipient_deadline', 'conflict'].map(stage => ({
      stage: stage as SuggestionReview['checks'][number]['stage'], passed: false,
      reason: 'Prazo e tarefa não identificados; conferir inteiro teor.',
    })),
  };
  const text = normalize(content.replace(/<[^>]+>/g, ' '));
  const recipient = deadlineRecipient(content);
  const directives = recipient.status === 'express' ? [] : recipientDirectives(content);
  if (directives.length > 1) {
    const reason = `O ato dá ordens distintas a cada parte: ${directives.map(d => `${d.party}${d.term ? ` (${d.term})` : ''} — ${d.task}`).join('; ')}. Criar a tarefa conforme a ordem dirigida ao cliente; a sugestão “${suggestion.pecaSugerida.peca}” não corresponde a essas ordens.`;
    return { version: 1, approved: false, checks: (['command', 'recipient_deadline', 'conflict'] as const).map(stage => ({ stage, passed: false, reason })) };
  }
  const evidence = normalize(recipient.evidence ?? '');
  const piece = normalize(suggestion.pecaSugerida.peca);
  const explicitActions = actions.filter(([, pattern]) => pattern.test(evidence));
  const pieceAction = piece.replace(/\s*\(\d+ dias\)$/, '').trim();
  const commandOk = explicitActions.length === 1 && pieceAction === explicitActions[0][0];

  // A literal quantity is required; omitted units follow an identified code.
  const intervals = [...evidence.matchAll(/\b(?:prazo\s+de\s+|em\s+)(\d{1,3})\s+(?:\([a-z ]+\)\s+)?dias?(?:\s+(uteis|corridos))?\b/g)];
  const interval = intervals[0];
  const codeUnit = suggestion.source === 'CPP' ? 'dias_corridos'
    : ['CPC', 'CLT', 'TST', 'JEC', 'JEF'].includes(suggestion.source ?? '') ? 'dias_uteis' : null;
  const intervalOk = intervals.length === 1 && !!interval && Number(interval[1]) === suggestion.days
    && (interval[2] === 'uteis' ? suggestion.unit === 'dias_uteis' : interval[2] === 'corridos' ? suggestion.unit === 'dias_corridos' : codeUnit !== null && suggestion.unit === codeUnit);
  const partyOk = recipient.status === 'express' && recipient.party !== 'Ambas as partes';
  const deadlineOk = partyOk && intervalOk && !!suggestion.dueDate && !!suggestion.startDate
    && suggestion.days === suggestion.pecaSugerida.prazo_dias;

  const conflictingActions = actions.filter(([, pattern]) => pattern.test(text));
  const responseConflict = /\bcontraminutas?\b/.test(text) && !piece.includes('contraminuta')
    || /\bcontrarrazoes\b/.test(text) && !piece.includes('contrarrazoes');
  const uncertain = /\b(?:alternativamente|subsidiariamente|sucessivamente|respectivamente|podendo|facultad\w*|facultativamente|a seu criterio|ou|anterior|revog\w*|nao|conforme|ementa|caso|se houver)\b/.test(text)
    || /["“”«»]/.test(text);
  const allIntervals = [...text.matchAll(/\b\d{1,3}\s+(?:\([a-z ]+\)\s+)?dias?\b/g)];
  const conflictOk = allIntervals.length === 1 && !responseConflict && !uncertain && conflictingActions.length === 1
    && !suggestion.pecaSugerida.peca_alternativa && !suggestion.isFallback
    && !['auto_baixa', 'ambigua_urgente'].includes(suggestion.classificacaoStatus)
    && !/\b(?:agravo|apelacao|recurso|embargos)\b/.test(piece)
    && recipient.status === 'express';
  const peca = suggestion.pecaSugerida.peca;
  const commandReason = commandOk ? 'Providência expressa compatível com a tarefa.'
    : explicitActions.length === 0 ? `O comando do ato não pede expressamente “${peca}”.`
    : explicitActions.length > 1 ? 'O ato traz mais de uma providência.'
    : `O ato pede ${explicitActions[0][0]}, não “${peca}”.`;
  const deadlineReason = deadlineOk ? `Destinatário e prazo compatíveis${!interval?.[2] ? `; contagem conforme ${suggestion.source}` : ''}.`
    : !partyOk ? 'O ato não nomeia uma única parte para cumprir.'
    : !interval ? `O ato não informa a quantidade de dias; o cálculo usa ${suggestion.days} dias pela regra legal.`
    : intervals.length > 1 ? 'O comando traz mais de um prazo.'
    : Number(interval[1]) !== suggestion.days ? `O ato fixa ${interval[1]} dias; a sugestão usa ${suggestion.days}.`
    : !interval[2] && !codeUnit ? 'Código de rito não identificado para definir a unidade da contagem.'
    : 'Unidade ou datas do prazo divergentes da sugestão.';
  const conflictReason = conflictOk ? 'Nenhum conflito identificado pelas regras de revisão.'
    : allIntervals.length > 1 ? `O ato menciona ${allIntervals.length} prazos distintos.`
    : responseConflict ? `O ato pede resposta diversa de “${peca}”.`
    : uncertain ? 'O texto tem alternativa, condição, negação ou citação.'
    : conflictingActions.length > 1 ? 'O ato traz mais de uma providência.'
    : suggestion.pecaSugerida.peca_alternativa ? 'A sugestão tem peça alternativa.'
    : suggestion.isFallback ? 'Prazo presumido por regra geral, sem comando específico.'
    : ['auto_baixa', 'ambigua_urgente'].includes(suggestion.classificacaoStatus) ? 'Classificação automática marcada como incerta.'
    : /\b(?:agravo|apelacao|recurso|embargos)\b/.test(piece) ? 'Peça recursal exige conferência de cabimento.'
    : recipient.status !== 'express' ? 'O ato não nomeia uma única parte para cumprir.'
    : 'O ato não fixa prazo em dias.';
  const checks: SuggestionReview['checks'] = [
    { stage: 'command', passed: commandOk, reason: commandReason },
    { stage: 'recipient_deadline', passed: deadlineOk, reason: deadlineReason },
    { stage: 'conflict', passed: conflictOk, reason: conflictReason },
  ];
  return { version: 1, approved: checks.every(check => check.passed), checks };
}