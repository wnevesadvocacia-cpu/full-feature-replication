-- 1) Policy SELECT em task_collaborators (correção de segurança)
CREATE POLICY "task_members_select_collaborators"
ON public.task_collaborators
FOR SELECT
USING (
  user_id = auth.uid()
  OR added_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_collaborators.task_id
      AND t.user_id = auth.uid()
  )
  OR public.can_delete(auth.uid())
);

-- 2) Índices de performance
CREATE INDEX IF NOT EXISTS idx_processes_user_id ON public.processes(user_id);
CREATE INDEX IF NOT EXISTS idx_intimations_user_id ON public.intimations(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_intimations_process_id ON public.intimations(process_id);
CREATE INDEX IF NOT EXISTS idx_processes_client_id ON public.processes(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_process_id ON public.tasks(process_id);