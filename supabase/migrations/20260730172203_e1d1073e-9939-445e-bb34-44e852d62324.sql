CREATE TABLE IF NOT EXISTS public.comment_reads (
  comment_id uuid NOT NULL REFERENCES public.process_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.comment_reads TO authenticated;
GRANT ALL ON public.comment_reads TO service_role;

ALTER TABLE public.comment_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own reads select" ON public.comment_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own reads insert" ON public.comment_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own reads delete" ON public.comment_reads
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.list_task_audit(_from date DEFAULT NULL, _to date DEFAULT NULL, _limit integer DEFAULT 1000)
RETURNS TABLE(
  id uuid,
  title text,
  status text,
  completed boolean,
  priority text,
  due_date date,
  start_date date,
  assignee text,
  created_by_email text,
  completed_by_email text,
  created_at timestamptz,
  completed_at timestamptz,
  process_number text,
  process_id uuid
)
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
    AND (_from IS NULL OR t.created_at >= _from::timestamptz)
    AND (_to IS NULL OR t.created_at < (_to + 1)::timestamptz)
  ORDER BY t.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 1000), 1), 5000);
$$;

GRANT EXECUTE ON FUNCTION public.list_task_audit(date, date, integer) TO authenticated;