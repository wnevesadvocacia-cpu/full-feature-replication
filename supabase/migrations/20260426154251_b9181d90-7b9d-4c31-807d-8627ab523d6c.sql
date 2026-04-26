-- Remove políticas permissivas de mutação
DROP POLICY IF EXISTS "admin gerente update comments" ON public.process_comments;
DROP POLICY IF EXISTS "admin gerente delete comments" ON public.process_comments;

-- Trigger que bloqueia UPDATE em nível de banco
CREATE OR REPLACE FUNCTION public.prevent_comment_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'process_comments é imutável: registros não podem ser alterados após inserção';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_comment_update ON public.process_comments;
CREATE TRIGGER trg_prevent_comment_update
BEFORE UPDATE ON public.process_comments
FOR EACH ROW EXECUTE FUNCTION public.prevent_comment_update();

-- Trigger que bloqueia DELETE em nível de banco
CREATE OR REPLACE FUNCTION public.prevent_comment_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'process_comments é imutável: registros não podem ser excluídos';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_comment_delete ON public.process_comments;
CREATE TRIGGER trg_prevent_comment_delete
BEFORE DELETE ON public.process_comments
FOR EACH ROW EXECUTE FUNCTION public.prevent_comment_delete();