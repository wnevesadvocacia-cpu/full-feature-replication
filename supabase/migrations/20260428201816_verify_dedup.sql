-- Verification function: count total and duplicate process_comments
CREATE OR REPLACE FUNCTION public.check_comment_duplicates()
RETURNS TABLE(total_rows bigint, duplicate_rows bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    COUNT(*) AS total_rows,
    COUNT(*) - COUNT(DISTINCT (process_id::text || '|' || content || '|' || created_at::text)) AS duplicate_rows
  FROM public.process_comments;
$$;

GRANT EXECUTE ON FUNCTION public.check_comment_duplicates() TO anon;
