-- Corrige processos vinculados a si mesmos como originário (autoreferência inválida)
-- e adiciona CHECK para impedir recorrência.
UPDATE public.processes
   SET parent_process_number = NULL
 WHERE parent_process_number IS NOT NULL
   AND regexp_replace(parent_process_number, '\D', '', 'g') = regexp_replace(number, '\D', '', 'g');

ALTER TABLE public.processes
  DROP CONSTRAINT IF EXISTS processes_parent_not_self;
ALTER TABLE public.processes
  ADD CONSTRAINT processes_parent_not_self
  CHECK (
    parent_process_number IS NULL
    OR regexp_replace(parent_process_number, '\D', '', 'g') <> regexp_replace(number, '\D', '', 'g')
  );