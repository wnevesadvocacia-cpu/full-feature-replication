// SprintClosure Item 5 — Sanitização XSS centralizada para conteúdo DJEN/intimações.
// Allowlist mínima de tags semânticas. Bloqueia explicitamente script, iframe, object,
// embed, form, input e qualquer atributo on* (event handlers). Links recebem
// rel="noopener noreferrer" + target="_blank" via hook afterSanitizeAttributes.
//
// Uso:
//   import { sanitizeIntimContent } from '@/lib/sanitizeHtml';
//   <div dangerouslySetInnerHTML={{ __html: sanitizeIntimContent(rawHtml) }} />
import DOMPurify from 'dompurify';

// Tags permitidas no render de intimações/publicações DJEN.
// Foco: texto formatado, listas, tabelas simples (atos judiciais usam tabelas para ementas).
const ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'span', 'div',
  'section', 'article', 'header', 'footer', 'small', 'sup', 'sub',
  'ul', 'ol', 'li', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'a',
];

// Atributos permitidos. Nenhum atributo on* ou style (style pode esconder phishing).
const ALLOWED_ATTR = ['href', 'title', 'align', 'colspan', 'rowspan'];

let hookInstalled = false;
function ensureHook() {
  if (hookInstalled) return;
  // Garante target=_blank + rel=noopener noreferrer em TODO link sanitizado,
  // e remove href javascript:/data: por segurança extra (DOMPurify já bloqueia,
  // mas double-check defensivo em caso de bypass futuro).
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^\s*(javascript|data|vbscript):/i.test(href)) {
        node.removeAttribute('href');
      }
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  hookInstalled = true;
}

/** Retorna HTML sanitizado, seguro para uso em dangerouslySetInnerHTML. */
export function sanitizeIntimContent(raw: string): string {
  if (!raw) return '';
  ensureHook();
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'style'],
    KEEP_CONTENT: true,
    USE_PROFILES: { html: true },
  });
}

/** Detecta se o input parece HTML. Útil para escolher entre <p> e dangerouslySetInnerHTML. */
export function looksLikeHtml(raw: string): boolean {
  return /<[a-z!/][^>]*>|&[a-z]+;|&#\d+;/i.test(raw);
}

/** Render seguro: retorna { html, text } — use html quando truthy, senão text. */
export function renderSafeContent(raw: string): { html: string | null; text: string | null } {
  if (!raw) return { html: null, text: '' };
  if (!looksLikeHtml(raw)) return { html: null, text: raw };
  return { html: sanitizeIntimContent(raw), text: null };
}
