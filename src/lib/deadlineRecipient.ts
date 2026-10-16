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
const imperative = new RegExp(`^${command}\\s+${article}(?:parte\\s+)?(${rolePattern})\\b`);
const subject = new RegExp(`^${article}(?:parte\\s+)?(${rolePattern})\\s+(?:devera|deverao)\\s+${action}\\b`);
const anyCommand = /\b(?:intime[m]?[ -]se|cite[m]?[ -]se|manifeste[m]?[ -]se|vista|vistas|apresente(?:m)?|ofereca(?:m)?|recolha(?:m)?|comprove(?:m)?|pague(?:m)?|emende(?:m)?|regularize(?:m)?|especifique(?:m)?|informe(?:m)?|cumpra(?:m)?|conteste(?:m)?|impugne(?:m)?|devera|deverao|prazo)\b/;
const accents: Record<string, string> = { acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', cedil: '\u0327', uml: '\u0308' };
// Sentence ends only at punctuation followed by space/end, so CNJ numbers and amounts stay intact.
const splitSentences = (plain: string) => plain.split(/[.;](?=\s|$)|[\n\r]+/).map(s => s.trim()).filter(Boolean);
// Closing formulas such as "Intimem-se." carry no addressee or deadline.
const formula = /^(?:(?:intime[m]?[ -]se|cumpra[ -]se|publique[ -]se|registre[ -]se|int|vista)[ ,e]*)+$/;
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
  else if (/parte\(s\)(?!\s*:)(?!\s*(?:recorrid|recorrente|agravad|agravante|apelad|apelante|embargad|embargante|exequente|executad|autor|r[eé]u?\b))/i.test(plain)) reason = 'o ato diz “parte(s)” sem indicar qual';
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
  if (/\b(?:revog\w*|torn[oa] sem efeito)\b/.test(normalized) || /parte\(s\)(?!\s*:)(?!\s*(?:recorrid|recorrente|agravad|agravante|apelad|apelante|embargad|embargante|exequente|executad|autor|r[eé]u?\b))/i.test(plain)) return unknown;
  const candidates: { party: string; evidence: string }[] = [];
  let unmatched = false;
  for (const sentence of splitSentences(plain)) {
    let text = normalize(sentence).replace(/^(?:(?:ante|diante|pelo|por todo) o exposto|isto posto|isso posto|posto isso|assim|dessa forma|desse modo|portanto|logo|outrossim|no mais|vistos|em seguida)\s*,?\s*/, '')
      // ESAJ folha prefix: "Fls. 57/61 (depósito e pedido de extinção): Manifeste-se..."
      .replace(/^(?:fls?\.?\s*)?[\d/]+\s*(?:\([^)]*\))?\s*:\s*/, '');
    // "Fica(m) intimada(s) a(s) parte(s) recorrida(s)" names the role expressly.
    text = text.replace(/\(m\)/g, '').replace(/^.*?\bficam?\s+intimad[oa]s?\s+(?:[ao]s?\s+)?(?:partes?\s+)?(recorrid[oa]|recorrente|agravad[oa]|agravante|apelad[oa]|apelante|embargad[oa]|embargante|exequente|executad[oa])s?\b/, 'intime-se a parte $1');
    // "Servirá a presente decisão como ofício a ser enviado/entregue pelo(a) <papel>":
    // the decision itself is the ofício and names who must deliver it.
    const oficio = text.match(new RegExp(`\\bservira\\b.*?\\boficio\\b.*?\\bpel[oa]\\s+(?:parte\\s+)?(${rolePattern})\\b`));
    if (oficio) {
      if (historical.test(text)) return unknown;
      const label = roles.find(([pattern]) => new RegExp(`^(?:${pattern})$`).test(oficio[1]))?.[1];
      if (!label) return unknown;
      candidates.push({ party: label, evidence: sentence });
      continue;
    }
    // "Oficie-se ao DETRAN/SPC/…" orders the office to notify a third party, not a process party.
    if (/^oficie[ -]se\b/.test(text)) continue;
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
    if (!subject.test(text) && !/^manifeste[m]?[ -]se\b/.test(text) && !new RegExp(`\\bpara\\s+(?:que\\s+)?(?:${action}|manifestacao|efetue|pague)|\\bpara\\s+que\\s+(?:apresente|ofereca|recolha|comprove|pague|cumpra|manifeste)m?\\b|\\b(?:em|prazo de)\\s+\\d+\\b`).test(tail)) return unknown;
    candidates.push({ party: label, evidence: sentence });
  }
  if (candidates.length > 1) return ambiguous;
  const candidate = candidates[0];
  if (unmatched || !candidate) return unknown;
  return { status: 'express', party: candidate.party, evidence: candidate.evidence };
}

const headerKeys: Record<string, string> = {
  'Parte autora': 'autora?|requerente', 'Parte ré': 're|reu|requerid[oa]', Exequente: 'exequente', 'Executado(a)': 'executad[oa]',
  Recorrente: 'recorrente', 'Recorrido(a)': 'recorrid[oa]', Agravante: 'agravante', 'Agravado(a)': 'agravad[oa]',
  Apelante: 'apelante', 'Apelado(a)': 'apelad[oa]', Embargante: 'embargante', 'Embargado(a)': 'embargad[oa]',
};
/** Name of the party listed under the matching role in the publication header,
 * only when that role lists exactly one distinct name. */
export function recipientPartyName(content: string | null | undefined, party: string | null): string | null {
  const key = party && headerKeys[party];
  if (!content || !key) return null;
  const plain = toPlain(content);
  const names = new Set([...plain.matchAll(new RegExp(`\\b(?:${key})(?:\\(a\\))?\\s*:\\s*(.+?)(?=\\s*(?:advogad|exequente|executad|autora?\\b|requerente|requerid|r[eé]u?\\b|recorr|agrav|apel|embarg|despacho|decis|senten|$))`, 'giu'))]
    .map(m => m[1].replace(/[.;,\s]+$/, '').trim()).filter(name => name.length > 2));
  return names.size === 1 ? [...names][0] : null;
}

export interface RecipientDirective { party: string; task: string; term: string | null; evidence: string }
const termOf = (text: string) => text.match(/\b(?:no prazo de|em|prazo de)\s+(\d{1,3}|cinco|dez|quinze|trinta)\s+(?:\([a-z ]+\)\s+)?dias(?:\s+(?:uteis|corridos))?/)?.[0]
  .replace(/^(?:no prazo de|prazo de|em)\s+/, '') ?? (/\bno mesmo prazo\b/.test(text) ? 'mesmo prazo' : null);
/** Orders addressed to a party named in the "Parte(s):" header or to the
 * patrono of a role, each with its own literal excerpt; never inferred. */
export function recipientDirectives(content: string | null | undefined): RecipientDirective[] {
  if (!content) return [];
  const plain = toPlain(content);
  const header = plain.match(/parte\(s\)\s*:\s*([^\n]+?)(?=\s*advogad|\n|$)/i)?.[1] ?? '';
  const names = header.split(';').map(name => name.trim()).filter(Boolean).map(name => ({
    name, key: normalize(name).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(t => t.length >= 3).slice(0, 2).join(' '),
  })).filter(n => n.key);
  // ESAJ caption "Processo N - Classe - Assunto - Autor - Réu - - Réu2": first named party is the active pole.
  const caption = normalize(plain.match(/processo\s+\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\s+-\s+([^\n]+)/i)?.[1] ?? '').replace(/[^a-z0-9 -]/g, ' ');
  const positions = names.map(n => caption.search(new RegExp(`\\b${n.key}\\b`))).filter(i => i >= 0);
  const roleOf = (key: string) => {
    const i = caption.search(new RegExp(`\\b${key}\\b`));
    return i < 0 || positions.length < 2 ? null : i === Math.min(...positions) ? 'Parte autora' : 'Parte ré';
  };
  const out: RecipientDirective[] = [];
  for (const sentence of plain.split(/(?<!\b[A-Za-z])[.;](?=\s|$)|[\n\r]+/).map(x => x.trim()).filter(Boolean)) {
    const text = normalize(sentence).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const raw = normalize(sentence);
    const named = names.find(n => new RegExp(`^(?:(?:o|a|os|as)\\s+)?${n.key}\\b`).test(text));
    if (named && /\bdeverao?\b/.test(raw)) {
      const task = sentence.replace(/,?\s*(?:no prazo de|em)\s+\d+\s+dias,?\s*|,?\s*no mesmo prazo,?\s*/gi, ' ').replace(/^[\s\S]*?\bdever[aá]o?\s+/i, '').trim();
      const role = roleOf(named.key);
      out.push({ party: role ? `${role} — ${named.name.toUpperCase()}` : named.name.toUpperCase(), task: task.length > 160 ? `${task.slice(0, 157)}…` : task, term: termOf(raw), evidence: sentence });
      continue;
    }
    const oficio = raw.match(/\bservira\b[\s\S]*?\boficio\b[\s\S]*?\bpel[oa]\s+(?:parte\s+)?(exequente|executad[oa]|autora?|requerente|reu?|requerid[oa])\b/);
    if (oficio) {
      const role = oficio[1];
      const party = role.startsWith('exequente') ? 'Exequente'
        : role.startsWith('executad') ? 'Executado(a)'
        : /^(?:autor|requerente)/.test(role) ? 'Parte autora' : 'Parte ré';
      out.push({ party, task: 'enviar o ofício (a própria decisão) ao destinatário indicado no ato', term: termOf(raw), evidence: sentence });
      continue;
    }
    const patrono = raw.match(/\bpatrono d[oa] (requerente|autora?|requerid[oa]|reu|re)\b[^,]*?,?\s*autorizad[oa] a ([^,]+)/);
    if (patrono) {
      const party = /^(?:requerente|autor)/.test(patrono[1]) ? 'Parte autora' : 'Parte ré';
      out.push({ party, task: `${sentence.match(/autorizad[oa] a ([^,]+)/i)?.[1] ?? patrono[2]}${/comprovad[oa] nos autos/.test(raw) ? ' e comprovar o protocolo nos autos' : ''}`, term: termOf(raw), evidence: sentence });
      continue;
    }
  }
  return out;
}
