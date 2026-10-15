import { extractCnjs } from './cnjRegex';

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
const imperative = new RegExp(`^${command}\\s+${article}(${rolePattern})\\b`);
const subject = new RegExp(`^${article}(${rolePattern})\\s+(?:devera|deverao)\\s+${action}\\b`);
const anyCommand = /\b(?:intime[m]?[ -]se|cite[m]?[ -]se|manifeste[m]?[ -]se|vista|vistas|apresente(?:m)?|ofereca(?:m)?|recolha(?:m)?|comprove(?:m)?|pague(?:m)?|emende(?:m)?|regularize(?:m)?|especifique(?:m)?|informe(?:m)?|cumpra(?:m)?|conteste(?:m)?|impugne(?:m)?|devera|deverao|prazo)\b/;
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(s\)/g, 's').replace(/\s+/g, ' ');

const toPlain = (content: string) => content.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&quot;|&#34;/gi, '"').replace(/&amp;/gi, '&');

/** Why the recipient stayed unconfirmed plus the literal command excerpts, so
 * the reader sees who was ordered to do what without opening the full text. */
export function recipientDiagnosis(content: string | null | undefined): { reason: string; excerpts: string[] } {
  if (!content) return { reason: 'publicação sem texto', excerpts: [] };
  const plain = toPlain(content);
  const normalized = normalize(plain);
  const sentences = plain.split(/[.;\n\r]+/).map(s => s.trim()).filter(Boolean);
  const excerpts = sentences.filter(s => anyCommand.test(normalize(s))).slice(0, 3)
    .map(s => s.length > 220 ? `${s.slice(0, 217)}…` : s);
  const cnjs = extractCnjs(plain).length;
  let reason = 'o ato não nomeia a parte que deve cumprir';
  if (cnjs > 1) reason = `o ato menciona ${cnjs} processos`;
  else if (/parte\(s\)/i.test(plain)) reason = 'o ato diz “parte(s)” sem indicar qual';
  else if (/["“”«»]|\b(?:anterior(?:mente)?|transcrev\w*|citando|conforme|vide|retro|nos termos|ementa|jurisprudencia|historico)\b/.test(normalized)) reason = 'o comando está citado ou remete a ato anterior';
  else if (/\b(?:revog\w*|torn[oa] sem efeito|nao|caso|se houver|ja intimad\w*|foi intimad\w*|foram intimad\w*)\b/.test(normalized)) reason = 'o comando é condicional, negativo ou já cumprido';
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
  if (extractCnjs(plain).length > 1) return ambiguous;
  // Do not decide whether quoted, conditional or prior directions still operate.
  if (/["“”«»]|\b(?:anterior(?:mente)?|transcrev\w*|citando|conforme|vide|retro|nos termos|ementa|jurisprudencia|historico|revog\w*|torn[oa] sem efeito|nao|caso|se houver|ja intimad\w*|foi intimad\w*|foram intimad\w*)\b/.test(normalized) || /parte\(s\)/i.test(plain)) return unknown;
  const sentences = plain.split(/[.;\n\r]+/).map(s => s.trim()).filter(Boolean);
  const candidates: { party: string; evidence: string }[] = [];
  let unmatched = false;
  for (const sentence of sentences) {
    const text = normalize(sentence);
    if (!anyCommand.test(text)) continue;
    const match = text.match(imperative) ?? text.match(subject);
    if (!match) { unmatched = true; continue; }
    const label = roles.find(([pattern]) => new RegExp(`^(?:${pattern})$`).test(match[1]))?.[1];
    if (!label) return unknown;
    const tail = text.slice(match[0].length);
    if (new RegExp(`\\b(?:${rolePattern})\\b`).test(tail) || /\b(?:para que|perito|uniao|ministerio publico|defensoria|intime[m]?[ -]se|cite[m]?[ -]se|manifeste[m]?[ -]se|se manifeste|devera|deverao|sucessiv\w*|respectiv\w*|subsidiari\w*)\b/.test(tail)) return ambiguous;
    // Notification alone is not a procedural deadline for the notified party.
    if (!subject.test(text) && !/^manifeste[m]?[ -]se\b/.test(text) && !new RegExp(`\\bpara\\s+(?:${action}|manifestacao)\\b|\\bem\\s+\\d+\\s+dias?\\b`).test(tail)) return unknown;
    candidates.push({ party: label, evidence: sentence });
  }
  if (candidates.length > 1) return ambiguous;
  const candidate = candidates[0];
  if (unmatched || !candidate) return unknown;
  return { status: 'express', party: candidate.party, evidence: candidate.evidence };
}
