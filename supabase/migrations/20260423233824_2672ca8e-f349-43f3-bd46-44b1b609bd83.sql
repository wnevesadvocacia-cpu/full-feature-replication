CREATE OR REPLACE FUNCTION public.can_delete(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'gerente'::app_role)
  )
$$;

DROP POLICY IF EXISTS "Users can delete own clients" ON public.clients;
CREATE POLICY "Only admin/gerente delete clients" ON public.clients
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own processes" ON public.processes;
CREATE POLICY "Only admin/gerente delete processes" ON public.processes
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own tasks" ON public.tasks;
CREATE POLICY "Only admin/gerente delete tasks" ON public.tasks
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own invoices" ON public.invoices;
CREATE POLICY "Only admin/gerente delete invoices" ON public.invoices
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "exp_delete" ON public.expenses;
CREATE POLICY "Only admin/gerente delete expenses" ON public.expenses
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "documents_delete" ON public.documents;
CREATE POLICY "Only admin/gerente delete documents" ON public.documents
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "templates_delete" ON public.document_templates;
CREATE POLICY "Only admin/gerente delete templates" ON public.document_templates
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "dv_delete" ON public.document_versions;
CREATE POLICY "Only admin/gerente delete versions" ON public.document_versions
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "intim_delete" ON public.intimations;
CREATE POLICY "Only admin/gerente delete intimations" ON public.intimations
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "te_delete" ON public.time_entries;
CREATE POLICY "Only admin/gerente delete time_entries" ON public.time_entries
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "fa_delete" ON public.fee_agreements;
CREATE POLICY "Only admin/gerente delete fee_agreements" ON public.fee_agreements
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "kc_delete" ON public.kanban_columns;
CREATE POLICY "Only admin/gerente delete kanban_columns" ON public.kanban_columns
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "oab_delete" ON public.oab_settings;
CREATE POLICY "Only admin/gerente delete oab_settings" ON public.oab_settings
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "cpt_delete" ON public.client_portal_tokens;
CREATE POLICY "Only admin/gerente delete portal tokens" ON public.client_portal_tokens
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "sr_delete" ON public.signature_requests;
CREATE POLICY "Only admin/gerente delete signature_requests" ON public.signature_requests
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "notif_delete" ON public.notifications;
CREATE POLICY "Only admin/gerente delete notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id AND public.can_delete(auth.uid()));