
-- Função: retorna true se o usuário tem qualquer papel atribuído (membro do escritório)
CREATE OR REPLACE FUNCTION public.is_office_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- Policies de SELECT compartilhado para todos os membros do escritório
CREATE POLICY "office_members_select_clients" ON public.clients
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_processes" ON public.processes
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_tasks" ON public.tasks
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_intimations" ON public.intimations
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_invoices" ON public.invoices
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_documents" ON public.documents
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_expenses" ON public.expenses
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_fee_agreements" ON public.fee_agreements
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_time_entries" ON public.time_entries
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_kanban_columns" ON public.kanban_columns
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_document_templates" ON public.document_templates
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_signature_requests" ON public.signature_requests
  FOR SELECT USING (public.is_office_member(auth.uid()));

CREATE POLICY "office_members_select_document_versions" ON public.document_versions
  FOR SELECT USING (public.is_office_member(auth.uid()));

-- Garante que novos usuários que se cadastram recebem automaticamente o papel "advogado"
-- (o primeiro usuário continua sendo admin pelo trigger existente)
CREATE OR REPLACE FUNCTION public.assign_default_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se já existe admin, atribui papel advogado por padrão
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'advogado')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_default_role();

-- Atribui papel "advogado" para qualquer usuário existente que ainda não tenha papel
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'advogado'::app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT DO NOTHING;
