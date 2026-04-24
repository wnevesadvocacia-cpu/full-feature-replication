
-- ============================================================
-- 1. Tabela de colaboradores explícitos por tarefa
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  can_edit BOOLEAN NOT NULL DEFAULT true,
  added_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

ALTER TABLE public.task_collaborators ENABLE ROW LEVEL SECURITY;

-- Membros do escritório veem todos os compartilhamentos (transparência)
CREATE POLICY "office_members_select_task_collaborators"
  ON public.task_collaborators FOR SELECT
  USING (public.is_office_member(auth.uid()));

-- Só o dono da tarefa (ou admin/gerente) pode adicionar/remover colaboradores
CREATE POLICY "task_owner_insert_collaborators"
  ON public.task_collaborators FOR INSERT
  WITH CHECK (
    auth.uid() = added_by AND (
      EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
      OR public.can_delete(auth.uid())
    )
  );

CREATE POLICY "task_owner_delete_collaborators"
  ON public.task_collaborators FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
    OR public.can_delete(auth.uid())
  );

-- ============================================================
-- 2. Função: pode editar tarefa?
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_edit_task(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN auth.users u ON u.id = _user_id
    WHERE t.id = _task_id
      AND (
        t.user_id = _user_id                         -- dono
        OR t.assignee = u.email                      -- assignee por email
        OR t.assignee = _user_id::text               -- assignee por id
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.task_collaborators tc
    WHERE tc.task_id = _task_id
      AND tc.user_id = _user_id
      AND tc.can_edit = true
  )
  OR public.can_delete(_user_id)                     -- admin/gerente
$$;

-- ============================================================
-- 3. Atualizar policy de UPDATE em tasks
-- ============================================================
DROP POLICY IF EXISTS "Users can update own tasks" ON public.tasks;

CREATE POLICY "Users can update assigned or owned tasks"
  ON public.tasks FOR UPDATE
  USING (public.can_edit_task(id, auth.uid()));

-- ============================================================
-- 4. Atualizar policy de UPDATE em processes (responsible também edita)
-- ============================================================
DROP POLICY IF EXISTS "Users can update own processes" ON public.processes;

CREATE POLICY "Users can update owned or responsible processes"
  ON public.processes FOR UPDATE
  USING (
    auth.uid() = user_id
    OR responsible = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR responsible = auth.uid()::text
    OR public.can_delete(auth.uid())
  );

-- ============================================================
-- 5. Índices para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_task_collaborators_task ON public.task_collaborators(task_id);
CREATE INDEX IF NOT EXISTS idx_task_collaborators_user ON public.task_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_processes_responsible ON public.processes(responsible);
