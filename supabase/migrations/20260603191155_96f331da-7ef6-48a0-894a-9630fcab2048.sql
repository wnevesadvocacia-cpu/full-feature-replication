CREATE OR REPLACE FUNCTION public.list_team_members()
 RETURNS TABLE(user_id uuid, email text, roles text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id AS user_id,
         u.email::text AS email,
         array_agg(ur.role::text ORDER BY ur.role::text) AS roles
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE public.is_office_member(auth.uid())
    AND u.email IS NOT NULL
    AND u.email NOT ILIKE 'e2e-%@example.com'
    AND u.email NOT ILIKE '%+e2e@%'
  GROUP BY u.id, u.email
  ORDER BY u.email;
$function$;