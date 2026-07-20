
CREATE OR REPLACE FUNCTION public.list_pending_tasks_for_process(_process_id uuid)
RETURNS TABLE(id uuid, title text, due_date date, assignee text, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.title, t.due_date, t.assignee, t.user_id
  FROM public.tasks t
  WHERE t.process_id = _process_id
    AND t.completed = false
    AND COALESCE(t.status, 'pendente') <> 'concluida'
    AND public.is_office_member(auth.uid())
  ORDER BY t.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.list_pending_tasks_for_process(uuid) TO authenticated;
