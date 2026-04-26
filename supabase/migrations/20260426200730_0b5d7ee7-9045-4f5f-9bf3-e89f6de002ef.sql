-- AVISO: o usuário confirmou explicitamente a abertura de leitura global.
-- Risco aceito: qualquer usuário autenticado poderá ler/inserir/atualizar process_comments.

ALTER TABLE public.process_comments ENABLE ROW LEVEL SECURITY;

-- Remove políticas anteriores conflitantes
DROP POLICY IF EXISTS "Users can read process comments for accessible processes" ON public.process_comments;
DROP POLICY IF EXISTS "Users can insert own process comments" ON public.process_comments;
DROP POLICY IF EXISTS "Users can update own process comments" ON public.process_comments;
DROP POLICY IF EXISTS "office members select all comments" ON public.process_comments;
DROP POLICY IF EXISTS "office members insert own comments" ON public.process_comments;
DROP POLICY IF EXISTS "allow_authenticated_select" ON public.process_comments;
DROP POLICY IF EXISTS "allow_authenticated_insert" ON public.process_comments;
DROP POLICY IF EXISTS "allow_authenticated_update" ON public.process_comments;

CREATE POLICY "allow_authenticated_select"
  ON public.process_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "allow_authenticated_insert"
  ON public.process_comments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "allow_authenticated_update"
  ON public.process_comments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Nota: DELETE permanece bloqueado pelo trigger prevent_comment_delete (imutabilidade).