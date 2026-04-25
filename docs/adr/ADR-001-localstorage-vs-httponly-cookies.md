# ADR-001 — Storage de sessão Supabase: localStorage vs httpOnly cookies

**Status:** Aceito (2026-04-25)
**Risco residual:** XSS exfiltration de access/refresh tokens — CVSS 8.2
**Owner:** Sec-Eng

## Contexto

O Supabase JS SDK persiste a sessão em `localStorage` por padrão (`storage: localStorage`
em `src/integrations/supabase/client.ts`). Tokens em `localStorage` ficam acessíveis a
qualquer JavaScript no mesmo origin, o que cria um vetor de exfiltração via XSS.

## Decisão

**Não migrar para httpOnly cookies nesta fase. Mitigar XSS no vetor primário.**

### Mitigações aplicadas (Sprint Closure 3a)
1. **CSP estrita** (`index.html`): `default-src 'self'`, `frame-ancestors 'none'`,
   `object-src 'none'`. Sem `unsafe-eval` em produção.
2. **DOMPurify** centralizado em `src/lib/sanitizeHtml.ts` com allowlist mínima.
   Aplicado em todo render de conteúdo externo (intimações DJEN, emails, OCR).
3. **Forbid attrs** event handlers (`on*`) e `style` para evitar CSS-based exfil.
4. **Links com `rel=noopener noreferrer`** automático via hook DOMPurify.
5. **CSRF defense-in-depth** já implementado em edges state-changing
   (`_shared/csrf.ts`).
6. **Origin allowlist** em CORS (`_shared/cors.ts`).

### Mitigações deferidas para release futura (3b)
- **sessionStorage migration**: provoca logout global imediato no deploy + invalida
  sessões em redes corporativas. Requer janela de manutenção comunicada.
- **Fingerprint check (UA + IP hash)**: false-positives em redes móveis (IP rotativo
  em 4G/5G, Wi-Fi corporativo com NAT).
- **httpOnly cookies via SSR proxy**: requer reescrita do client Supabase + proxy
  Edge Function que rehidrata o token a cada request. Alto risco de regressão em
  fluxos PKCE, OAuth e magic-link. Sem QA dedicado, fica fora do escopo.

## Consequências

### Positivas
- Vetor XSS principal (HTML injection em intimações DJEN) está fechado por
  DOMPurify + CSP.
- Zero regressão em fluxos de autenticação existentes.
- Permite roll-out incremental de mitigações futuras sem big-bang.

### Negativas / risco residual
- Se um XSS for descoberto fora do path sanitizado (ex.: bug no CSP, dependência
  com `dangerouslySetInnerHTML` direto), tokens permanecem exfiltráveis.
- Sem fingerprint, um token roubado pode ser usado em outro device até o refresh
  (auto-refresh = 1h por default Supabase).

## Plano de evolução
1. **Q3/2026** — Implementar fingerprint check apenas em UA hash (sem IP) com
   re-auth opcional no AuthContext. Logging de mismatch em `audit_logs`.
2. **Q4/2026** — Migração para httpOnly cookies via Edge Function proxy
   `/functions/v1/auth-proxy`. Sprint dedicada com QA + rollback plan.
3. **Sempre** — Auditoria periódica de `dangerouslySetInnerHTML` no codebase via
   ESLint rule `react/no-danger`.

## Auditoria

```bash
# Verificar que apenas paths sanitizados usam dangerouslySetInnerHTML
rg "dangerouslySetInnerHTML" --type tsx --type ts src/
```

Resultado esperado: apenas em pontos que importam `sanitizeIntimContent` de
`@/lib/sanitizeHtml`.
