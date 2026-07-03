ALTER TABLE public.tasks
ADD CONSTRAINT tasks_assignee_required
CHECK (assignee IS NOT NULL AND btrim(assignee) <> '') NOT VALID;