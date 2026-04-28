CREATE OR REPLACE FUNCTION public.exec_admin_sql(sql_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected integer;
BEGIN
  EXECUTE sql_text;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'rows_affected', rows_affected);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'state', SQLSTATE);
END $$;

REVOKE ALL ON FUNCTION public.exec_admin_sql(text) FROM public;
REVOKE ALL ON FUNCTION public.exec_admin_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_admin_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exec_admin_sql(text) TO service_role;