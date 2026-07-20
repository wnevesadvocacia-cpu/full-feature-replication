REVOKE EXECUTE ON FUNCTION public.list_pending_tasks_for_process_number(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_pending_tasks_for_process_number(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_pending_tasks_for_process_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_tasks_for_process_number(text) TO service_role;