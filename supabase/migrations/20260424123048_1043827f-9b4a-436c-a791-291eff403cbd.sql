DO $$
DECLARE
  _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'clients',
    'processes',
    'tasks',
    'invoices',
    'expenses',
    'fee_agreements',
    'intimations',
    'documents',
    'document_templates',
    'document_versions',
    'time_entries',
    'notifications',
    'client_portal_tokens',
    'signature_requests',
    'kanban_columns',
    'office_settings',
    'notification_preferences',
    'oab_settings'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.can_delete(auth.uid()))',
      'admin_manager_select_all_' || _table,
      _table
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.can_delete(auth.uid()))',
      'admin_manager_update_all_' || _table,
      _table
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (public.can_delete(auth.uid()))',
      'admin_manager_delete_all_' || _table,
      _table
    );
  END LOOP;
END
$$;