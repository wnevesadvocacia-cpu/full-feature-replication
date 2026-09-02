CREATE OR REPLACE FUNCTION public.list_task_audit(_from date DEFAULT NULL, _to date DEFAULT NULL, _limit integer DEFAULT 1000)
RETURNS TABLE(id uuid, title text, status text, completed boolean, priority text, due_date date, start_date date, assignee text, created_by_email text, completed_by_email text, created_at timestamp with time zone, completed_at timestamp with time zone, process_number text, process_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.title, t.status, t.completed, t.priority, t.due_date, t.start_date,
         t.assignee,
         cu.email::text AS created_by_email,
         co.email::text AS completed_by_email,
         t.created_at, t.completed_at,
         p.number AS process_number, t.process_id
  FROM public.tasks t
  LEFT JOIN auth.users cu ON cu.id = t.created_by
  LEFT JOIN auth.users co ON co.id = t.completed_by
  LEFT JOIN public.processes p ON p.id = t.process_id
  WHERE public.is_office_member(auth.uid())
    AND (
      (
        (_from IS NULL OR t.created_at >= _from::timestamptz)
        AND (_to IS NULL OR t.created_at < (_to + 1)::timestamptz)
      )
      OR (
        t.completed_at IS NOT NULL
        AND (_from IS NULL OR t.completed_at >= _from::timestamptz)
        AND (_to IS NULL OR t.completed_at < (_to + 1)::timestamptz)
      )
      OR (
        t.due_date IS NOT NULL
        AND (_from IS NULL OR t.due_date >= _from)
        AND (_to IS NULL OR t.due_date <= _to)
      )
    )
  ORDER BY t.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 1000), 1), 5000);
$$;