CREATE OR REPLACE FUNCTION public.auth_user_exists_by_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email) = lower(trim(_email))
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_exists_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_user_exists_by_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.auth_user_exists_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_exists_by_email(text) TO service_role;