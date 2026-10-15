import { deadlineRecipient } from './deadlineRecipient.ts';

interface Suggestion {
  days: number;
  unit: string;
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
  ['pagamento', /\bpara\s+pagar\b/],
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
  const evidence = normalize(recipient.evidence ?? '');
  const piece = normalize(suggestion.pecaSugerida.peca);
  const explicitActions = actions.filter(([, pattern]) => pattern.test(evidence));
  const pieceAction = piece.replace(/\s*\(\d+ dias\)$/, '').trim();
  const commandOk = explicitActions.length === 1 && pieceAction === explicitActions[0][0];

  // A literal interval is required; inferred statutory/fallback periods are held.
  const intervals = [...evidence.matchAll(/\b(?:prazo\s+de\s+|em\s+)(\d{1,3})\s+dias?(?:\s+(uteis|corridos))?\b/g)];
  const interval = intervals[0];
  const intervalOk = intervals.length === 1 && !!interval && Number(interval[1]) === suggestion.days
    && (interval[2] === 'uteis' ? suggestion.unit === 'dias_uteis' : interval[2] === 'corridos' ? suggestion.unit === 'dias_corridos' : false);
  const partyOk = recipient.status === 'express' && recipient.party !== 'Ambas as partes';
  const deadlineOk = partyOk && intervalOk && !!suggestion.dueDate && !!suggestion.startDate
    && suggestion.days === suggestion.pecaSugerida.prazo_dias;

  const conflictingActions = actions.filter(([, pattern]) => pattern.test(text));
  const responseConflict = /\bcontraminutas?\b/.test(text) && !piece.includes('contraminuta')
    || /\bcontrarrazoes\b/.test(text) && !piece.includes('contrarrazoes');
  const uncertain = /\b(?:alternativamente|subsidiariamente|sucessivamente|respectivamente|ou|anterior|revog\w*|nao|conforme|ementa|caso|se houver)\b/.test(text)
    || /["“”«»]/.test(text);
  const conflictOk = !responseConflict && !uncertain && conflictingActions.length === 1
    && !suggestion.pecaSugerida.peca_alternativa && !suggestion.isFallback
    && !['auto_baixa', 'ambigua_urgente'].includes(suggestion.classificacaoStatus)
    && !/\b(?:agravo|apelacao|recurso|embargos)\b/.test(piece)
    && recipient.status === 'express';
  const checks: SuggestionReview['checks'] = [
    { stage: 'command', passed: commandOk, reason: commandOk ? 'Providência expressa compatível com a tarefa.' : 'Tarefa sem correspondência inequívoca com o comando atual.' },
    { stage: 'recipient_deadline', passed: deadlineOk, reason: deadlineOk ? 'Destinatário e intervalo expresso compatíveis.' : 'Destinatário individual, quantidade ou unidade do prazo não comprovados.' },
    { stage: 'conflict', passed: conflictOk, reason: conflictOk ? 'Nenhum conflito identificado pelas regras de revisão.' : 'Ambiguidade, alternativa ou incompatibilidade exige conferência jurídica.' },
  ];
  return { version: 1, approved: checks.every(check => check.passed), checks };
}