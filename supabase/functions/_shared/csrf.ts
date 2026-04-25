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

  // Sec-Fetch-Site é a checagem mais robusta (browsers modernos sempre enviam).
  // 'cross-site' = página em domínio totalmente diferente disparou o request.
  if (secFetchSite === 'cross-site') {
    return { ok: false, reason: 'cross_site_blocked' };
  }

  // Se browser enviou Origin, deve estar na allowlist.
  if (origin) {
    if (!isOriginAllowed(origin)) {
      return { ok: false, reason: 'origin_not_allowed' };
    }
    return { ok: true };
  }

  // Sem Origin mas com Referer — valida Referer.
  // Útil para alguns navegadores antigos / requisições GET cross-iframe.
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

  // Sem Origin nem Referer:
  // - Pode ser server-to-server legítimo (cron, edge-to-edge) → permitir.
  // - Pode ser request fabricada por atacante → mas sem cookie automático
  //   (usamos Authorization header), ataque CSRF clássico não funciona.
  // - Para edges sensíveis, o caller ainda precisa do JWT do usuário.
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
