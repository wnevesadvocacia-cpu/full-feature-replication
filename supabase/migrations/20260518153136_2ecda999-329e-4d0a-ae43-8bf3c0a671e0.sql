CREATE OR REPLACE FUNCTION public.search_process_options(_term text, _limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  number text,
  title text,
  client_id uuid,
  client_name text,
  client_document text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      trim(COALESCE(_term, '')) AS raw_term,
      regexp_replace(
        translate(trim(COALESCE(_term, '')), 'oOiIlL', '001111'),
        '\D',
        '',
        'g'
      ) AS digits_term
  )
  SELECT
    p.id,
    p.number,
    p.title,
    p.client_id,
    COALESCE(c.name, p.client_name) AS client_name,
    c.document AS client_document
  FROM public.processes p
  LEFT JOIN public.clients c ON c.id = p.client_id
  CROSS JOIN normalized n
  WHERE n.raw_term <> ''
    AND (
      (length(n.digits_term) >= 3 AND regexp_replace(p.number, '\D', '', 'g') ILIKE '%' || n.digits_term || '%')
      OR p.number ILIKE '%' || n.raw_term || '%'
      OR p.title ILIKE '%' || n.raw_term || '%'
      OR COALESCE(c.name, p.client_name, '') ILIKE '%' || n.raw_term || '%'
      OR COALESCE(c.document, '') ILIKE '%' || n.raw_term || '%'
    )
  ORDER BY
    CASE WHEN length(n.digits_term) >= 3 AND regexp_replace(p.number, '\D', '', 'g') = n.digits_term THEN 0 ELSE 1 END,
    p.number ASC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 100);
$$;