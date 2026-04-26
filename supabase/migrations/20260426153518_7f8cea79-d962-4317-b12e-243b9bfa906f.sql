
CREATE TABLE public.process_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid REFERENCES public.processes(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  content text NOT NULL,
  type text NOT NULL DEFAULT 'comentario',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT process_comments_target_check CHECK (process_id IS NOT NULL OR task_id IS NOT NULL),
  CONSTRAINT process_comments_type_check CHECK (type IN ('comentario','andamento','despacho','publicacao','conclusao','documento'))
);

CREATE INDEX idx_process_comments_process ON public.process_comments(process_id, created_at DESC);
CREATE INDEX idx_process_comments_task ON public.process_comments(task_id, created_at DESC);

ALTER TABLE public.process_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office members select all comments"
  ON public.process_comments FOR SELECT
  USING (public.is_office_member(auth.uid()));

CREATE POLICY "office members insert own comments"
  ON public.process_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_office_member(auth.uid()));

CREATE POLICY "admin gerente update comments"
  ON public.process_comments FOR UPDATE
  USING (public.can_delete(auth.uid()));

CREATE POLICY "admin gerente delete comments"
  ON public.process_comments FOR DELETE
  USING (public.can_delete(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.process_comments;
ALTER TABLE public.process_comments REPLICA IDENTITY FULL;
