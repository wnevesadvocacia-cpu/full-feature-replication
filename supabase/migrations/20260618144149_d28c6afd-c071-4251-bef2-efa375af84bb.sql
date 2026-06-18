
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS completed_by uuid,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill: preenche created_by com user_id para registros existentes
UPDATE public.tasks SET created_by = user_id WHERE created_by IS NULL;

-- Trigger BEFORE INSERT: força created_by = auth.uid() (fallback user_id)
CREATE OR REPLACE FUNCTION public.tasks_set_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(_uid, NEW.user_id);
    NEW.created_at := COALESCE(NEW.created_at, now());
    IF NEW.completed = true THEN
      NEW.completed_by := COALESCE(_uid, NEW.user_id);
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    ELSE
      NEW.completed_by := NULL;
      NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Imutáveis: created_by, created_at não podem mudar
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;

    IF NEW.completed IS DISTINCT FROM OLD.completed THEN
      IF NEW.completed = true THEN
        NEW.completed_by := COALESCE(_uid, NEW.user_id);
        NEW.completed_at := now();
      ELSE
        NEW.completed_by := NULL;
        NEW.completed_at := NULL;
      END IF;
    ELSE
      -- completed não mudou: preserva os campos de conclusão (imutáveis)
      NEW.completed_by := OLD.completed_by;
      NEW.completed_at := OLD.completed_at;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_set_audit_fields_ins ON public.tasks;
CREATE TRIGGER trg_tasks_set_audit_fields_ins
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_set_audit_fields();

DROP TRIGGER IF EXISTS trg_tasks_set_audit_fields_upd ON public.tasks;
CREATE TRIGGER trg_tasks_set_audit_fields_upd
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_set_audit_fields();
