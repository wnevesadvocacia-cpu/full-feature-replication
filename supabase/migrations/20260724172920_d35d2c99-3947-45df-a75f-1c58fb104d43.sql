CREATE OR REPLACE FUNCTION public.list_supervisors()
RETURNS TABLE (user_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ur.user_id FROM public.user_roles ur
  WHERE ur.role IN ('admin'::app_role, 'gerente'::app_role);
$$;
GRANT EXECUTE ON FUNCTION public.list_supervisors() TO authenticated;