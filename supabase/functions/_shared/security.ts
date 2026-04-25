// S26 (server-side): mascara email em logs de edge functions.
export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** Extrai IP do request (Cloudflare/Supabase Edge → x-forwarded-for ou cf-connecting-ip). */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return 'unknown';
}

/** Hash SHA-256 do IP (não armazena IP em claro — LGPD). */
export async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ip:${ip}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * S22: comparação constant-time real via crypto.subtle.timingSafeEqual
 * (Deno) ou fallback manual sobre Uint8Array. Recebe dois hex strings de
 * mesmo tamanho — converte para bytes e compara byte-a-byte sem early exit.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  const bytesA = hexToBytes(a);
  const bytesB = hexToBytes(b);
  if (!bytesA || !bytesB || bytesA.length !== bytesB.length) return false;

  // Deno expõe crypto.subtle.timingSafeEqual em runtimes recentes;
  // se não estiver disponível, faz comparação manual constant-time.
  const subtle: any = (crypto as any).subtle;
  if (subtle && typeof subtle.timingSafeEqual === 'function') {
    try { return subtle.timingSafeEqual(bytesA, bytesB); } catch { /* fallback */ }
  }
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}
