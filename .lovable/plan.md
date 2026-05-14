## Objetivo

Definir os e-mails de contato do WnevesBox:
- **Principal (Reply-To):** `wnevesadvocacia@gmail.com`
- **Alternativo (backup interno):** `wneves2006@yahoo.com.br`

E-mails do sistema continuam saindo de `noreply@notify.wnevesbox.com`. Estes dois endereços servem apenas para receber respostas e contato humano.

## Mudanças

### 1. `supabase/functions/auth-email-hook/index.ts`
- Adicionar constantes:
  ```ts
  const REPLY_TO_PRIMARY = "wnevesadvocacia@gmail.com"
  const REPLY_TO_ALT     = "wneves2006@yahoo.com.br"
  ```
- Incluir `reply_to: REPLY_TO_PRIMARY` no payload enfileirado em `enqueue_email` para que toda resposta a e-mail de auth caia no Gmail.

### 2. Templates de e-mail (rodapé) — 6 arquivos em `supabase/functions/_shared/email-templates/`
Adicionar linha no rodapé:
> Dúvidas? Responda este e-mail ou escreva para **wnevesadvocacia@gmail.com** (alternativo: wneves2006@yahoo.com.br).

Aplicar em: `signup.tsx`, `recovery.tsx`, `magic-link.tsx`, `invite.tsx`, `email-change.tsx`, `reauthentication.tsx`.

### 3. Deploy
Redeploy de `auth-email-hook` para aplicar templates + reply-to.

## Fora do escopo
- Não toca em `SENDER_DOMAIN`, `FROM_DOMAIN`, `SITE_NAME`, `ROOT_DOMAIN`.
- Não altera schema, RLS, outras edge functions, nem código `src/`.
- Não cria página de Configurações nova (a existente não muda agora).

## Resultado
Qualquer cliente que receber e-mail do sistema e clicar em "Responder" terá a mensagem direcionada ao Gmail (`wnevesadvocacia@gmail.com`). O Yahoo fica registrado como backup visível no rodapé.
