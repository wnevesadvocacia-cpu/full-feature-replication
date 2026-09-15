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
    AND COALESCE(t.status, 'pendente') NOT IN ('concluida', 'cancelada')
    AND public.is_office_member(auth.uid())
  ORDER BY t.created_at DESC
$$;

REVOKE EXECUTE ON FUNCTION public.list_pending_tasks_for_process(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_pending_tasks_for_process(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_pending_tasks_for_process(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_tasks_for_process(uuid) TO service_role;

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
    AND COALESCE(t.status, 'pendente') NOT IN ('concluida', 'cancelada')
  ORDER BY t.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.list_pending_tasks_for_process_number(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_pending_tasks_for_process_number(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_pending_tasks_for_process_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_tasks_for_process_number(text) TO service_role;