ALTER TABLE public.process_comments DISABLE TRIGGER USER;

DELETE FROM public.process_comments
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY process_id, content, created_at ORDER BY id) AS rn
    FROM public.process_comments
    WHERE author_name LIKE '[AdvBox]%'
  ) t
  WHERE rn > 1
);

ALTER TABLE public.process_comments ENABLE TRIGGER USER;