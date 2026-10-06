ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS elaborating_by uuid;
COMMENT ON COLUMN public.tasks.elaborating_by IS 'Authenticated user who entered em_elaboracao, independent of assignee. Server controlled.';

UPDATE public.tasks t
SET elaborating_by = (
  SELECT a.user_id FROM public.audit_logs a
  WHERE a.table_name = 'tasks' AND a.record_id = t.id
    AND a.new_data->>'status' = 'em_elaboracao'
    AND (a.old_data->>'status') IS DISTINCT FROM 'em_elaboracao'
  ORDER BY a.created_at DESC LIMIT 1
)
WHERE t.status = 'em_elaboracao';

CREATE OR REPLACE FUNCTION public.tasks_set_drafting_actor()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.elaborating_by := CASE WHEN NEW.status = 'em_elaboracao' THEN auth.uid() ELSE NULL END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.elaborating_by := CASE WHEN NEW.status = 'em_elaboracao' THEN auth.uid() ELSE NULL END;
  ELSE
    NEW.elaborating_by := OLD.elaborating_by;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_tasks_set_drafting_actor
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_set_drafting_actor();