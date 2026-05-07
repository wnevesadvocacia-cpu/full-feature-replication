ALTER TABLE public.process_comments DISABLE TRIGGER USER;

DELETE FROM public.process_comments
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY process_id, substring(content, 1, 80), substring(created_at::text, 1, 16) ORDER BY id) AS rn
    FROM public.process_comments
    WHERE author_name LIKE '[AdvBox]%'
  ) t
  WHERE rn > 1
);

ALTER TABLE public.process_comments ENABLE TRIGGER USER;