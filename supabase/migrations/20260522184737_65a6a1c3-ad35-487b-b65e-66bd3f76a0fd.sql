
-- Fix overly-permissive RLS on processes
DROP POLICY IF EXISTS allow_authenticated_select ON public.processes;
DROP POLICY IF EXISTS allow_authenticated_insert ON public.processes;
DROP POLICY IF EXISTS allow_authenticated_update ON public.processes;
DROP POLICY IF EXISTS allow_authenticated_delete ON public.processes;

CREATE POLICY "Users can view own processes" ON public.processes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin_manager_select_all_processes" ON public.processes
  FOR SELECT TO authenticated USING (public.can_delete(auth.uid()));
CREATE POLICY "Users can insert own processes" ON public.processes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own processes" ON public.processes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin_manager_update_all_processes" ON public.processes
  FOR UPDATE TO authenticated USING (public.can_delete(auth.uid())) WITH CHECK (public.can_delete(auth.uid()));
CREATE POLICY "Only admin/gerente delete processes" ON public.processes
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND public.can_delete(auth.uid()));
CREATE POLICY "admin_manager_delete_all_processes" ON public.processes
  FOR DELETE TO authenticated USING (public.can_delete(auth.uid()));

-- Fix overly-permissive RLS on process_comments
DROP POLICY IF EXISTS allow_authenticated_select ON public.process_comments;
DROP POLICY IF EXISTS allow_authenticated_insert ON public.process_comments;
DROP POLICY IF EXISTS allow_authenticated_update ON public.process_comments;

CREATE POLICY "Users can view own process_comments" ON public.process_comments
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.processes p WHERE p.id = process_comments.process_id AND p.user_id = auth.uid())
    OR public.can_delete(auth.uid())
  );
CREATE POLICY "Users can insert own process_comments" ON public.process_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- UPDATE blocked at trigger level (prevent_comment_update); no UPDATE policy needed.
