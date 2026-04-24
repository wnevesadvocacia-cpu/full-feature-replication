-- 1) Remover policies que vazam dados entre usuários (office_members_select_*)
DROP POLICY IF EXISTS office_members_select_clients ON public.clients;
DROP POLICY IF EXISTS office_members_select_processes ON public.processes;
DROP POLICY IF EXISTS office_members_select_invoices ON public.invoices;
DROP POLICY IF EXISTS office_members_select_expenses ON public.expenses;
DROP POLICY IF EXISTS office_members_select_tasks ON public.tasks;
DROP POLICY IF EXISTS office_members_select_documents ON public.documents;
DROP POLICY IF EXISTS office_members_select_document_templates ON public.document_templates;
DROP POLICY IF EXISTS office_members_select_document_versions ON public.document_versions;
DROP POLICY IF EXISTS office_members_select_fee_agreements ON public.fee_agreements;
DROP POLICY IF EXISTS office_members_select_time_entries ON public.time_entries;
DROP POLICY IF EXISTS office_members_select_kanban_columns ON public.kanban_columns;
DROP POLICY IF EXISTS office_members_select_intimations ON public.intimations;
DROP POLICY IF EXISTS office_members_select_signature_requests ON public.signature_requests;
DROP POLICY IF EXISTS office_members_select_task_collaborators ON public.task_collaborators;

-- 2) Restringir tokens do portal a admin (gerente não vê tokens de autenticação)
DROP POLICY IF EXISTS admin_manager_select_all_client_portal_tokens ON public.client_portal_tokens;
DROP POLICY IF EXISTS admin_manager_update_all_client_portal_tokens ON public.client_portal_tokens;
DROP POLICY IF EXISTS admin_manager_delete_all_client_portal_tokens ON public.client_portal_tokens;

CREATE POLICY admin_select_client_portal_tokens ON public.client_portal_tokens
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY admin_update_client_portal_tokens ON public.client_portal_tokens
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY admin_delete_client_portal_tokens ON public.client_portal_tokens
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Permitir que usuários atualizem as próprias versões de documento
CREATE POLICY dv_update ON public.document_versions
  FOR UPDATE USING (auth.uid() = user_id);