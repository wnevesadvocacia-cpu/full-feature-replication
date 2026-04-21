

## Problema: ao clicar no link do email, a página `/reset-password` não mostra o formulário

### Diagnóstico

O Supabase envia o link de recuperação no formato:
```
https://<app>/reset-password#access_token=...&type=recovery&refresh_token=...
```

O token vem no **fragment hash** (`#`), não em query params. O `ResetPassword.tsx` atual depende exclusivamente do evento `PASSWORD_RECOVERY` do `onAuthStateChange` para liberar o formulário. Em alguns casos (especialmente quando a página carrega pela primeira vez), esse evento não dispara antes do `getSession()`, ou a sessão é criada como `SIGNED_IN` normal sem disparar `PASSWORD_RECOVERY`. Resultado: `hasRecoverySession` fica `false` e aparece a mensagem "Link inválido ou expirado".

Além disso, se o link foi enviado quando a URL do app era diferente (ex: preview vs published), o redirect pode não bater com a rota atual.

### O que será corrigido

**1. Reescrever a detecção de sessão de recuperação em `src/pages/ResetPassword.tsx`**

- Detectar explicitamente o hash da URL ao montar o componente: se `window.location.hash` contém `type=recovery` E `access_token`, processar manualmente:
  - Extrair `access_token` e `refresh_token` do hash
  - Chamar `supabase.auth.setSession({ access_token, refresh_token })` para estabelecer a sessão
  - Marcar `hasRecoverySession = true`
  - Limpar o hash da URL (`window.history.replaceState`)
- Manter o listener `onAuthStateChange` como fallback para o evento `PASSWORD_RECOVERY`
- Manter o `getSession()` como fallback final: se já existe sessão ativa quando a página carrega, considerar válida para reset
- Mostrar logs no console para debug (`console.log` do hash detectado e do resultado de `setSession`)

**2. Garantir que o redirect do email aponte para a URL correta**

Em `src/pages/Auth.tsx`, o `redirectTo` já usa `${window.location.origin}/reset-password`. Verificar que o link no email está vindo com essa URL — se o usuário solicitou o reset estando no preview (`id-preview--*.lovable.app`), o link vai para o preview. Não há mudança de código aqui, mas vou adicionar uma observação no toast de sucesso lembrando o usuário de abrir o link **no mesmo navegador** onde solicitou.

**3. Estado de loading mais claro**

- Enquanto detecta o hash/sessão, mostrar "Validando link de recuperação..."
- Se falhar, mostrar erro específico com botão para solicitar novo link

### Detalhes técnicos

```ts
// Pseudocódigo da nova lógica de detecção
useEffect(() => {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace('#', ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');

  if (type === 'recovery' && accessToken && refreshToken) {
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (!error) {
          setHasRecoverySession(true);
          window.history.replaceState(null, '', window.location.pathname);
        }
        setChecking(false);
      });
    return;
  }

  // fallback: listener + getSession existentes
  ...
}, []);
```

### Observação importante

O email que você recebeu veio de `no-reply@md.lovable-app.email` e o link de redirect provavelmente aponta para `id-preview--b753a021-ff4f-4e59-b4fd-f9f912a4c7bf.lovable.app/reset-password`. Para o link funcionar:

- Abra o email **no mesmo navegador** onde você está usando o app
- Se você publicar o app, solicite um **novo** reset depois de publicado para que o link aponte para a URL publicada

### Próximos passos após aprovação

Implementar a nova detecção de hash em `ResetPassword.tsx` e te pedir para clicar novamente no link do email (ou solicitar um novo reset).

