// CNJ process number matcher.
// Aceita CNJ com máscara (5006940-82.2023.8.13.0637) ou sem (20 dígitos).
export const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|\b\d{20}\b/;
export const CNJ_RE_G = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|\b\d{20}\b/g;

export const hasCnj = (text: string | null | undefined): boolean =>
  CNJ_RE.test(text || '');

// Normaliza para o formato mascarado NNNNNNN-DD.AAAA.J.TR.OOOO.
export const maskCnj = (raw: string): string | null => {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length !== 20) return /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(raw) ? raw : null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
};

// Extrai todos os CNJs de um texto, retornando na forma mascarada e sem duplicatas.
export const extractCnjs = (text: string | null | undefined): string[] => {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(CNJ_RE_G)) {
    const masked = maskCnj(m[0]);
    if (masked && !seen.has(masked)) { seen.add(masked); out.push(masked); }
  }
  return out;
};
