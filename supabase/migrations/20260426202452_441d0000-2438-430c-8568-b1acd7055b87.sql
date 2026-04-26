-- AVISO: usuário confirmou explicitamente abertura global. Risco aceito.
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own processes" ON public.processes;
DROP POLICY IF EXISTS "Users can insert own processes" ON public.processes;
DROP POLICY IF EXISTS "Users can update owned or responsible processes" ON public.processes;
DROP POLICY IF EXISTS "Only admin/gerente delete processes" ON public.processes;
DROP POLICY IF EXISTS "admin_manager_select_all_processes" ON public.processes;
DROP POLICY IF EXISTS "admin_manager_update_all_processes" ON public.processes;
DROP POLICY IF EXISTS "admin_manager_delete_all_processes" ON public.processes;
DROP POLICY IF EXISTS "allow_authenticated_select" ON public.processes;
DROP POLICY IF EXISTS "allow_authenticated_insert" ON public.processes;
DROP POLICY IF EXISTS "allow_authenticated_update" ON public.processes;
DROP POLICY IF EXISTS "allow_authenticated_delete" ON public.processes;

CREATE POLICY "allow_authenticated_select"
  ON public.processes FOR SELECT TO authenticated USING (true);

CREATE POLICY "allow_authenticated_insert"
  ON public.processes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "allow_authenticated_update"
  ON public.processes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_delete"
  ON public.processes FOR DELETE TO authenticated USING (true);