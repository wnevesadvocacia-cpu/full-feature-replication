## Suportar login por OTP **e** por senha

### Mudança principal
Adicionar abas "Código" e "Senha" na tela `/auth`. O usuário escolhe como entrar. O fluxo de OTP atual continua intacto. O fluxo de senha usa `supabase.auth.signInWithPassword` e habilita "Esqueci minha senha" → `resetPasswordForEmail` → `/reset-password` (que já existe).

### Arquivos alterados

**`src/pages/Auth.tsx`** (principal)
- Adicionar `Tabs` com 2 abas: **Código** (OTP — fluxo atual, default) e **Senha**.
- Aba "Senha":
  - Campos: e-mail + senha
  - Botão **Entrar** → `supabase.auth.signInWithPassword({ email, password })` → `navigate('/dashboard')`
  - Link **Esqueci minha senha** → `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/#/reset-password' })` + toast de confirmação
  - Tradução de erros comuns ("Invalid login credentials" → "E-mail ou senha incorretos", "Email not confirmed" → "Confirme seu e-mail antes de entrar")
  - Mantém honeypot e rate-limit de envio aplicado também ao reset

**`src/pages/Equipe.tsx`** (ajuste fino)
- O botão "Resetar senha" passa a fazer sentido (já dispara `resetPasswordForEmail`). Adicionar tooltip explicando: "Envia e-mail com link para o usuário definir nova senha."
- Quando criar novo usuário, manter o comportamento atual (envia link de definição de senha).

**Sem mudanças em:**
- `ResetPassword.tsx` (já funciona — escuta `PASSWORD_RECOVERY`)
- `AuthContext.tsx` (já trata `PASSWORD_RECOVERY` e redireciona)
- Edge functions OTP (`send-otp-resend`, `verify-otp-resend`)
- Templates de e-mail (signup/recovery já configurados com Reply-To)

### Comportamento resultante
- **Login por código** (atual): e-mail → OTP de 6 dígitos → dashboard.
- **Login por senha** (novo): e-mail + senha → dashboard.
- **Esqueci senha**: e-mail de recovery → clique no link → `/reset-password` → define nova senha → dashboard.
- **Caso pbelgini**: da próxima vez ela poderá usar a aba "Senha" depois de redefinir; ou continuar usando "Código" se preferir.

### Observação de segurança
- Senhas são validadas pelo Supabase Auth (mínimo 6 chars padrão; HIBP já ativável).
- Rate-limit de tentativas de senha: o Supabase já aplica throttling server-side; mantemos o lockout por OTP separado.
