CREATE OR REPLACE FUNCTION public.list_pending_tasks_for_process_number(_process_number text)
RETURNS TABLE(id uuid, title text, due_date date, assignee text, user_id uuid, process_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT p.id
    FROM public.processes p
    WHERE regexp_replace(coalesce(p.number, ''), '\\D', '', 'g') = regexp_replace(coalesce(_process_number, ''), '\\D', '', 'g')
      AND public.is_office_member(auth.uid())
  )
  SELECT t.id, t.title, t.due_date, t.assignee, t.user_id, t.process_id
  FROM public.tasks t
  JOIN target p ON p.id = t.process_id
  WHERE t.completed = false
    AND COALESCE(t.status, 'pendente') <> 'concluida'
  ORDER BY t.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_pending_tasks_for_process_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_tasks_for_process_number(text) TO service_role;