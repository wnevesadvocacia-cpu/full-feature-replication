DROP POLICY IF EXISTS docs_storage_select ON storage.objects;
CREATE POLICY docs_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.can_delete(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = storage.objects.name
        AND d.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS office_members_view_assigned_open_tasks ON public.tasks;
CREATE POLICY office_members_view_assigned_open_tasks ON public.tasks
FOR SELECT TO authenticated
USING (
  completed = false
  AND COALESCE(lower(btrim(assignee)), '') <> ALL (ARRAY['movimentacao','documento','agenda'])
  AND assignee IS NOT NULL
  AND lower(btrim(assignee)) = lower(btrim(public.current_user_email()))
);

CREATE OR REPLACE FUNCTION public.can_edit_task(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN auth.users u ON u.id = _user_id
    WHERE t.id = _task_id
      AND (
        t.user_id = _user_id
        OR (u.email IS NOT NULL AND lower(btrim(t.assignee)) = lower(btrim(u.email)))
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.task_collaborators tc
    WHERE tc.task_id = _task_id
      AND tc.user_id = _user_id
      AND tc.can_edit = true
  )
  OR public.can_delete(_user_id)
$function$;