CREATE POLICY "office_members_view_assigned_open_tasks"
ON public.tasks
FOR SELECT
USING (
  public.is_office_member(auth.uid())
  AND completed = false
  AND COALESCE(lower(trim(assignee)), '') NOT IN ('movimentacao', 'documento', 'agenda')
);