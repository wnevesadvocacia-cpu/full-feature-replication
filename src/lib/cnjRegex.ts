// CNJ process number matcher.
// Aceita CNJ com máscara (5006940-82.2023.8.13.0637) ou sem (20 dígitos).
export const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|\b\d{20}\b/;

export const hasCnj = (text: string | null | undefined): boolean =>
  CNJ_RE.test(text || '');
