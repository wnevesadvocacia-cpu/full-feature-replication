DELETE FROM public.processes p
USING public.processes p2
WHERE p.user_id = p2.user_id
  AND p.number = p2.number
  AND (p.created_at > p2.created_at
       OR (p.created_at = p2.created_at AND p.id > p2.id));

ALTER TABLE public.processes
  ADD CONSTRAINT processes_user_number_unique UNIQUE (user_id, number);

UPDATE public.intimations i
SET process_id = p.id
FROM public.processes p
WHERE i.process_id IS NULL
  AND i.user_id = p.user_id
  AND i.content LIKE '%' || p.number || '%';