ALTER TABLE public.processes DROP CONSTRAINT IF EXISTS processes_status_check;

ALTER TABLE public.processes
  ADD CONSTRAINT processes_status_check
  CHECK (status IN ('prospecto','novo','ativo','recursal','arquivado','concluido','suspenso','em_andamento'));