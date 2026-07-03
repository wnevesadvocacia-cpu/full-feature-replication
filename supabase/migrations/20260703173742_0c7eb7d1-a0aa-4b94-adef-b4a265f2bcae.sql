ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_assignee_required;

CREATE OR REPLACE FUNCTION public.enforce_task_assignee_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.assignee IS NULL OR btrim(NEW.assignee) = '' THEN
    RAISE EXCEPTION 'Responsável obrigatório para cadastrar tarefa.';
  END IF;
  NEW.assignee := btrim(NEW.assignee);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_task_assignee_required ON public.tasks;
CREATE TRIGGER trg_enforce_task_assignee_required
BEFORE INSERT OR UPDATE OF assignee ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_task_assignee_required();