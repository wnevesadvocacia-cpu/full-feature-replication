
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email::text FROM auth.users WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated;

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
    OR lower(assignee) = lower(public.current_user_email())
  )
);
