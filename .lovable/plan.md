

## Adicionar link "Esqueceu a senha?" na tela de login

Vou adicionar um link discreto na tela de login (`/auth`) que permite ao usuário recuperar a senha por email, e criar a página de redefinição correspondente.

### O que será feito

**1. Link "Esqueceu a senha?" em `src/pages/Auth.tsx`**
- Aparece logo abaixo do campo de senha, alinhado à direita, apenas no modo login (não no cadastro).
- Ao clicar, abre um pequeno modal (Dialog) pedindo o email para envio do link de recuperação.
- Botão "Enviar link de recuperação" chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: '${window.location.origin}/reset-password' })`.
- Mostra toast de sucesso: "Email enviado! Verifique sua caixa de entrada."
- Trata erros traduzidos em português.

**2. Nova página `/reset-password` (`src/pages/ResetPassword.tsx`)**
- Página pública (fora do `ProtectedRoute`) com mesmo layout visual do Auth (painel lateral WnevesBox + formulário).
- Detecta o token de recuperação do Supabase automaticamente via `onAuthStateChange` (evento `PASSWORD_RECOVERY`).
- Formulário com dois campos: nova senha + confirmar senha (mínimo 6 caracteres, devem coincidir).
- Botão "Redefinir senha" chama `supabase.auth.updateUser({ password })`.
- Após sucesso: toast "Senha redefinida!" e redireciona para `/dashboard`.
- Se o usuário acessar a página sem token válido, mostra mensagem e link para voltar ao login.

**3. Rota em `src/App.tsx`**
- Adicionar `<Route path="/reset-password" element={<ResetPassword />} />` como rota pública (mesmo nível de `/auth`).

### Detalhes técnicos
- Usar componentes existentes do shadcn: `Dialog`, `Input`, `Label`, `Button`, ícone `KeyRound` do lucide-react para o link.
- Sem mudanças de schema/RLS — recuperação de senha é gerenciada pelo Supabase Auth.
- O email de recuperação usa o template padrão do Supabase Auth (já configurado).

### Observação
O link de recuperação enviado por email só funciona na **URL publicada** ou no **domínio personalizado**. No iframe de preview da Lovable o redirect pode ser bloqueado — recomendo testar publicando o app.

