DROP POLICY IF EXISTS office_members_view_assigned_open_tasks ON public.tasks;

CREATE POLICY office_members_view_assigned_open_tasks
ON public.tasks
FOR SELECT
TO authenticated
USING (
  completed = false
  AND COALESCE(lower(trim(assignee)), '') <> ALL (ARRAY['movimentacao','documento','agenda'])
  AND (
    assignee = auth.uid()::text
    OR lower(assignee) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  )
);