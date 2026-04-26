ALTER TABLE public.process_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read process_comments" ON public.process_comments;
DROP POLICY IF EXISTS "Authenticated users can insert process_comments" ON public.process_comments;
DROP POLICY IF EXISTS "Authenticated users can update process_comments" ON public.process_comments;
DROP POLICY IF EXISTS "Users can read process comments for accessible processes" ON public.process_comments;
DROP POLICY IF EXISTS "Users can insert own process comments" ON public.process_comments;
DROP POLICY IF EXISTS "Users can update own process comments" ON public.process_comments;

CREATE POLICY "Users can read process comments for accessible processes"
ON public.process_comments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_delete(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.processes p
    WHERE p.id = process_comments.process_id
      AND (
        p.user_id = auth.uid()
        OR p.responsible = auth.uid()::text
        OR p.responsible = (
          SELECT u.email
          FROM auth.users u
          WHERE u.id = auth.uid()
        )
      )
  )
);

CREATE POLICY "Users can insert own process comments"
ON public.process_comments
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own process comments"
ON public.process_comments
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR public.can_delete(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.can_delete(auth.uid()));