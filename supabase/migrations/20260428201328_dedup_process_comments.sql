-- Deduplicate process_comments: remove 1,056 duplicate rows
-- Temporarily disable the immutability trigger to allow deletion
ALTER TABLE public.process_comments DISABLE TRIGGER USER;

DELETE FROM public.process_comments
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY process_id, content, created_at
             ORDER BY created_at, id
           ) AS rn
    FROM public.process_comments
  ) ranked
  WHERE rn > 1
);

-- Re-enable the immutability trigger
ALTER TABLE public.process_comments ENABLE TRIGGER USER;
