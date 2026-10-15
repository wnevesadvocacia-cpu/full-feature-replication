const extractCnjs = (text: string): string[] => [...new Set((text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|\b\d{20}\b/g) ?? []).map(value => value.replace(/\D/g, '')))];

export interface DeadlineRecipientResult {
  status: 'express' | 'unknown' | 'ambiguous';
  party: string | null;
  evidence: string | null;
}

const roles = [
  ['parte autora|autor(?:a)?', 'Parte autora'], ['parte re|reu|re', 'Parte ré'],
  ['exequente', 'Exequente'], ['executad[oa]', 'Executado(a)'],
  ['recorrente', 'Recorrente'], ['recorrid[oa]', 'Recorrido(a)'],
  ['agravante', 'Agravante'], ['agravad[oa]', 'Agravado(a)'],
  ['apelante', 'Apelante'], ['apelad[oa]', 'Apelado(a)'],
  ['embargante', 'Embargante'], ['embargad[oa]', 'Embargado(a)'],
  ['ambas as partes|partes', 'Ambas as partes'],
] as const;
const rolePattern = roles.map(([pattern]) => pattern).join('|');
const article = '(?:(?:o|a|os|as|ao|aos|do|da)\\s+)?';
const command = '(?:intime[m]?[ -]se|cite[m]?[ -]se|manifeste[m]?[ -]se|vista|vistas|abra[ -]se vista|de[ -]se vista)';
const action = '(?:apresentar|oferecer|manifestar|recolher|comprovar|pagar|emendar|regularizar|especificar|informar|cumprir|contestar|impugnar)';
const imperative = new RegExp(`^${command}\\s+${article}(?:parte\\s+)?(${rolePattern})\\b`);
const subject = new RegExp(`^${article}(?:parte\\s+)?(${rolePattern})\\s+(?:devera|deverao)\\s+${action}\\b`);
const anyCommand = /\b(?:intime[m]?[ -]se|cite[m]?[ -]se|manifeste[m]?[ -]se|vista|vistas|apresente(?:m)?|ofereca(?:m)?|recolha(?:m)?|comprove(?:m)?|pague(?:m)?|emende(?:m)?|regularize(?:m)?|especifique(?:m)?|informe(?:m)?|cumpra(?:m)?|conteste(?:m)?|impugne(?:m)?|devera|deverao|prazo)\b/;
const accents: Record<string, string> = { acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', cedil: '\u0327', uml: '\u0308' };
// Sentence ends only at punctuation followed by space/end, so CNJ numbers and amounts stay intact.
const splitSentences = (plain: string) => plain.split(/[.;](?=\s|$)|[\n\r]+/).map(s => s.trim()).filter(Boolean);
// Closing formulas such as "Intimem-se." carry no addressee or deadline.
const formula = /^(?:(?:intime[m]?[ -]se|cumpra[ -]se|publique[ -]se|registre[ -]se|int)[ ,e]*)+$/;
const historical = /["“”«»]|\b(?:anterior(?:mente)?|transcrev\w*|citando|conforme|vide|retro|nos termos(?! d[oa]s? (?:art|lei|cpc|codigo))|ementa|jurisprudencia|historico|nao|caso|se houver|ja intimad\w*|foi intimad\w*|foram intimad\w*)\b/;
const otherActor = /\b(?:perito|uniao|ministerio publico|defensoria|serventia|cartorio|secretaria|oficial|contador|contadoria|administrador judicial|leiloeiro|terceir\w*|intime[m]?[ -]se|cite[m]?[ -]se|manifeste[m]?[ -]se|se manifeste|devera|deverao|sucessiv\w*|respectiv\w*|subsidiari\w*)\b/;
const processLabels = (plain: string) => new Set([...normalize(plain).matchAll(/\bprocesso\s*(?:n[o.º°]*\s*)?:?\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g)].map(m => m[1])).size;
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(s\)/g, 's').replace(/\s+/g, ' ');

const toPlain = (content: string) => content.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&quot;|&#34;/gi, '"').replace(/&amp;/gi, '&')
  .replace(/&([a-z])(acute|grave|circ|tilde|cedil|uml);?/gi, (_, letter: string, mark: string) => (letter + accents[mark.toLowerCase()]).normalize('NFC'));

/** Why the recipient stayed unconfirmed plus the literal command excerpts, so
 * the reader sees who was ordered to do what without opening the full text. */
export function recipientDiagnosis(content: string | null | undefined): { reason: string; excerpts: string[] } {
  if (!content) return { reason: 'publicação sem texto', excerpts: [] };
  const plain = toPlain(content);
  const normalized = normalize(plain);
  const excerpts = splitSentences(plain).filter(s => anyCommand.test(normalize(s)) && !formula.test(normalize(s))).slice(0, 3)
    .map(s => s.length > 220 ? `${s.slice(0, 217)}…` : s);
  const cnjs = processLabels(plain);
  let reason = 'o ato não nomeia a parte que deve cumprir';
  if (cnjs > 1) reason = `a publicação reúne ${cnjs} processos`;
  else if (/parte\(s\)/i.test(plain)) reason = 'o ato diz “parte(s)” sem indicar qual';
  else if (/\b(?:revog\w*|torn[oa] sem efeito)\b/.test(normalized)) reason = 'o ato revoga ou torna sem efeito ordem anterior';
  else if (excerpts.some(e => historical.test(normalize(e)))) reason = 'o comando é citado, condicional, negativo ou já cumprido';
  else if (deadlineRecipient(content).status === 'ambiguous') reason = 'há mais de um destinatário ou providência';
  else if (!excerpts.length) reason = 'o ato não contém comando com prazo';
  return { reason, excerpts };
}

/** Textual indication only, never office representation. Unsupported, quoted,
 * historical or multiple directions deliberately remain unconfirmed. */
export function deadlineRecipient(content: string | null | undefined): DeadlineRecipientResult {
  const unknown: DeadlineRecipientResult = { status: 'unknown', party: null, evidence: null };
  const ambiguous: DeadlineRecipientResult = { status: 'ambiguous', party: null, evidence: null };
  if (!content) return unknown;
  const plain = toPlain(content);
  const normalized = normalize(plain);
  if (processLabels(plain) > 1 || extractCnjs(plain).length > 1 && !/\bprocesso\b/.test(normalized)) return ambiguous;
  if (/\b(?:revog\w*|torn[oa] sem efeito)\b/.test(normalized) || /parte\(s\)/i.test(plain)) return unknown;
  const candidates: { party: string; evidence: string }[] = [];
  let unmatched = false;
  for (const sentence of splitSentences(plain)) {
    const text = normalize(sentence).replace(/^(?:(?:ante|diante|pelo|por todo) o exposto|isto posto|isso posto|posto isso|assim|dessa forma|desse modo|portanto|logo|outrossim|no mais|vistos|em seguida)\s*,?\s*/, '');
    if (!anyCommand.test(text) || formula.test(text)) continue;
    // Do not decide whether quoted, conditional or prior directions still operate.
    if (historical.test(text)) return unknown;
    const match = text.match(imperative) ?? text.match(subject);
    if (!match) { unmatched = true; continue; }
    const label = roles.find(([pattern]) => new RegExp(`^(?:${pattern})$`).test(match[1]))?.[1];
    if (!label) return unknown;
    const tail = text.slice(match[0].length);
    if (new RegExp(`\\b(?:o|a|os|as|ao|aos|do|da|dos|das|e|ou)\\s+(?:parte\\s+)?(?:${rolePattern})\\b`).test(tail) || otherActor.test(tail)) return ambiguous;
    // Notification alone is not a procedural deadline for the notified party.
    if (!subject.test(text) && !/^manifeste[m]?[ -]se\b/.test(text) && !new RegExp(`\\bpara\\s+(?:que\\s+)?(?:${action}|manifestacao|efetue|pague)|\\b(?:em|prazo de)\\s+\\d+\\b`).test(tail)) return unknown;
    candidates.push({ party: label, evidence: sentence });
  }
  if (candidates.length > 1) return ambiguous;
  const candidate = candidates[0];
  if (unmatched || !candidate) return unknown;
  return { status: 'express', party: candidate.party, evidence: candidate.evidence };
}
