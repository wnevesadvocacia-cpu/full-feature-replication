-- 1) Tabela de auditoria
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL, -- INSERT | UPDATE | DELETE
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_table_record ON public.audit_logs (table_name, record_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admin/gerente podem ver
CREATE POLICY "audit_select_admin_gerente"
ON public.audit_logs FOR SELECT
USING (public.can_delete(auth.uid()));

-- INSERT permitido (triggers usam SECURITY DEFINER, mas mantemos política aberta para inserts via app autenticado se necessário)
CREATE POLICY "audit_insert_authenticated"
ON public.audit_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Sem UPDATE nem DELETE: imutável

-- 2) Função genérica de trigger
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _user_email TEXT;
  _record_id UUID;
  _old JSONB;
  _new JSONB;
  _changed TEXT[];
  _key TEXT;
BEGIN
  -- email do usuário (se autenticado)
  IF _user_id IS NOT NULL THEN
    SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    _old := to_jsonb(OLD);
    _record_id := (OLD).id;
    INSERT INTO public.audit_logs (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (_user_id, _user_email, 'DELETE', TG_TABLE_NAME, _record_id, _old);
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    _record_id := (NEW).id;
    -- campos alterados
    SELECT array_agg(k) INTO _changed
    FROM jsonb_object_keys(_new) k
    WHERE _new->k IS DISTINCT FROM _old->k
      AND k NOT IN ('updated_at');
    IF _changed IS NOT NULL AND array_length(_changed, 1) > 0 THEN
      INSERT INTO public.audit_logs (user_id, user_email, action, table_name, record_id, old_data, new_data, changed_fields)
      VALUES (_user_id, _user_email, 'UPDATE', TG_TABLE_NAME, _record_id, _old, _new, _changed);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'INSERT' THEN
    _new := to_jsonb(NEW);
    _record_id := (NEW).id;
    INSERT INTO public.audit_logs (user_id, user_email, action, table_name, record_id, new_data)
    VALUES (_user_id, _user_email, 'INSERT', TG_TABLE_NAME, _record_id, _new);
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- 3) Anexar triggers às tabelas sensíveis
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'clients','processes','invoices','intimations','documents',
    'fee_agreements','expenses','time_entries','tasks',
    'signature_requests','user_roles','document_versions',
    'document_templates','client_portal_tokens'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I
       AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();',
      t, t
    );
  END LOOP;
END$$;