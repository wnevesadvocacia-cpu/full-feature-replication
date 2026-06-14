-- Restringe a política de membros do escritório em tasks para apenas tarefas atribuídas ao próprio usuário (por email ou id), em vez de expor todas as tarefas incompletas do escritório.
DROP POLICY IF EXISTS office_members_view_assigned_open_tasks ON public.tasks;

CREATE POLICY office_members_view_assigned_open_tasks
ON public.tasks
FOR SELECT
TO authenticated
USING (
  is_office_member(auth.uid())
  AND completed = false
  AND COALESCE(lower(trim(assignee)), '') <> ALL (ARRAY['movimentacao','documento','agenda'])
  AND (
    assignee = auth.uid()::text
    OR lower(assignee) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  )
);