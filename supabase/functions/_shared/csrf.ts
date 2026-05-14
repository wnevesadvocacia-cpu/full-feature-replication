// S12 (Sprint Final): defense-in-depth contra CSRF para edges state-changing.
// Ainda usamos localStorage (Sec-4 S7 httpOnly cookies foi adiado para release futura),
// então adicionamos camada extra de validação de Origin/Referer/Sec-Fetch-Site.
//
// Regras:
//   - Sec-Fetch-Site: 'same-origin' ou 'same-site' → OK
//   - Sec-Fetch-Site: 'cross-site' → BLOCK (browser moderno bateu cross-origin)
//   - Sec-Fetch-Site ausente (server-to-server / curl / cron) → permite, mas exige
//     que NÃO tenha Origin de host externo
//   - Se Origin presente, deve estar na allowlist de cors.ts
//   - Se Origin ausente mas Referer presente, valida Referer
//
// Edges visadas: admin-create-user, gerar-peca, ocr-documento, sync-djen (manual),
// otp-request/verify (chamadas pelo browser durante login).
//
// IMPORTANTE: NÃO aplicar em webhooks server-to-server (resend-webhook, auth-email-hook).
// Para esses, o Origin não é enviado e a validação é por assinatura HMAC.

import { isOriginAllowed } from './cors.ts';

export interface CsrfCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Valida que a request veio de uma origem confiável (browser same-site)
 * ou de um caller server-to-server legítimo (sem Origin/Referer).
 *
 * Use APENAS em edges chamadas pelo browser autenticado.
 */
export function validateBrowserCsrf(req: Request): CsrfCheckResult {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const secFetchSite = req.headers.get('sec-fetch-site');

  // Se browser enviou Origin, ela é a fonte autoritativa.
  // Note: chamadas browser→Supabase Edge Functions são SEMPRE 'cross-site'
  // (lovable.app ≠ supabase.co), então não dá para usar Sec-Fetch-Site
  // como bloqueio cego — usamos a allowlist de Origin como autoridade.
  if (origin) {
    if (!isOriginAllowed(origin)) {
      return { ok: false, reason: 'origin_not_allowed' };
    }
    return { ok: true };
  }

  // Sem Origin mas com Referer — valida Referer.
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!isOriginAllowed(refOrigin)) {
        return { ok: false, reason: 'referer_not_allowed' };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: 'invalid_referer' };
    }
  }

  // Sem Origin nem Referer: server-to-server legítimo (cron, edge-to-edge,
  // webhook). CSRF clássico não funciona porque não usamos cookies — auth
  // é via Authorization header.
  // Bloqueamos apenas se o browser explicitamente sinalizou cross-site SEM
  // ter mandado Origin (cenário anômalo).
  if (secFetchSite === 'cross-site') {
    return { ok: false, reason: 'cross_site_no_origin' };
  }
  return { ok: true };
}

/** Helper que devolve Response 403 se CSRF check falhar. */
export function rejectIfCsrfBlocked(req: Request, corsHeaders: Record<string, string>): Response | null {
  const check = validateBrowserCsrf(req);
  if (check.ok) return null;
  return new Response(
    JSON.stringify({ error: 'csrf_blocked', reason: check.reason }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
