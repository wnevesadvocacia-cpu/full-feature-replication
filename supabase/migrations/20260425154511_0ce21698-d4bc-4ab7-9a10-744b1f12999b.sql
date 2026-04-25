-- Sec-3.1 — MFA grace
CREATE OR REPLACE FUNCTION public.reset_mfa_grace(target_user_id uuid, _days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _new_grace timestamptz := now() + (_days || ' days')::interval;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden: service_role only'; END IF;
  UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data,'{}'::jsonb)
    || jsonb_build_object('mfa_grace_until', to_char(_new_grace,'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   WHERE id = target_user_id;
  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, new_data)
  VALUES (target_user_id, 'MFA_GRACE_RESET', 'auth.users', target_user_id,
          jsonb_build_object('grace_until', _new_grace, 'days', _days));
  RETURN jsonb_build_object('ok', true, 'grace_until', _new_grace);
END; $$;
REVOKE ALL ON FUNCTION public.reset_mfa_grace(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_mfa_grace(uuid, integer) FROM authenticated;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles WHERE role='admin' LOOP
    UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data,'{}'::jsonb)
      || jsonb_build_object('mfa_grace_until', to_char(now() + interval '7 days','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
     WHERE id = r.user_id;
  END LOOP;
END $$;

-- Sec-3.2 — known_devices
CREATE TABLE IF NOT EXISTS public.known_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ua_hash text NOT NULL,
  ip_hash text NOT NULL,
  user_agent text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ua_hash, ip_hash)
);
ALTER TABLE public.known_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own_devices" ON public.known_devices FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "service_role_all_known_devices" ON public.known_devices FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
CREATE POLICY "admin_select_known_devices" ON public.known_devices FOR SELECT USING (has_role(auth.uid(),'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_known_devices_user ON public.known_devices(user_id);

CREATE OR REPLACE FUNCTION public.register_device(_ua_hash text, _ip_hash text, _user_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _user_id uuid := auth.uid(); _existing public.known_devices; _is_new boolean := false;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;
  SELECT * INTO _existing FROM public.known_devices WHERE user_id=_user_id AND ua_hash=_ua_hash AND ip_hash=_ip_hash;
  IF _existing.id IS NULL THEN
    INSERT INTO public.known_devices(user_id, ua_hash, ip_hash, user_agent) VALUES (_user_id,_ua_hash,_ip_hash,_user_agent);
    _is_new := true;
  ELSE
    UPDATE public.known_devices SET last_seen_at=now() WHERE id=_existing.id;
  END IF;
  RETURN jsonb_build_object('ok',true,'is_new',_is_new);
END; $$;
GRANT EXECUTE ON FUNCTION public.register_device(text,text,text) TO authenticated;

-- Sec-3.3 — auth audit
CREATE OR REPLACE FUNCTION public.log_auth_event(_event text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _user_id uuid := auth.uid(); _email text;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  SELECT email INTO _email FROM auth.users WHERE id=_user_id;
  INSERT INTO public.audit_logs(user_id, user_email, action, table_name, new_data)
  VALUES (_user_id, _email, 'AUTH_'||upper(_event), 'auth.users', _metadata);
END; $$;
GRANT EXECUTE ON FUNCTION public.log_auth_event(text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_auth_users_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _action text := NULL; _meta jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP='INSERT' THEN
    _action := 'AUTH_SIGNUP'; _meta := jsonb_build_object('email', NEW.email);
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.email IS DISTINCT FROM NEW.email THEN
      _action := 'AUTH_EMAIL_CHANGE'; _meta := jsonb_build_object('old_email',OLD.email,'new_email',NEW.email);
    ELSIF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
      _action := 'AUTH_PASSWORD_CHANGE';
    ELSIF (OLD.raw_app_meta_data->>'mfa_enrolled') IS DISTINCT FROM (NEW.raw_app_meta_data->>'mfa_enrolled') THEN
      _action := CASE WHEN (NEW.raw_app_meta_data->>'mfa_enrolled')::boolean THEN 'AUTH_MFA_ENROLLED' ELSE 'AUTH_MFA_DISABLED' END;
    END IF;
  END IF;
  IF _action IS NOT NULL THEN
    INSERT INTO public.audit_logs(user_id, user_email, action, table_name, record_id, new_data)
    VALUES (NEW.id, NEW.email, _action, 'auth.users', NEW.id, _meta);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_auth_users ON auth.users;
CREATE TRIGGER audit_auth_users AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_auth_users_change();

-- Sprint 2.6 — oab_sync_cursor
CREATE TABLE IF NOT EXISTS public.oab_sync_cursor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  oab_settings_id uuid NOT NULL,
  oab text NOT NULL,
  last_seen_disponibilizacao date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (oab_settings_id)
);
ALTER TABLE public.oab_sync_cursor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own_cursor" ON public.oab_sync_cursor FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "admin_select_all_cursors" ON public.oab_sync_cursor FOR SELECT USING (can_delete(auth.uid()));
CREATE POLICY "service_role_all_cursors" ON public.oab_sync_cursor FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
CREATE INDEX IF NOT EXISTS idx_oab_cursor_updated ON public.oab_sync_cursor(updated_at);

-- Sprint 2.7 — record_intimation atômica
CREATE OR REPLACE FUNCTION public.record_intimation(p_user_id uuid, p_external_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _intim_id uuid; _is_urgent boolean := COALESCE((p_payload->>'is_urgent')::boolean, false);
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden: service_role only'; END IF;
  INSERT INTO public.intimations(user_id, external_id, source, court, content, received_at, deadline, process_id, status)
  VALUES (
    p_user_id, p_external_id,
    COALESCE(p_payload->>'source','djen'),
    p_payload->>'court',
    p_payload->>'content',
    COALESCE((p_payload->>'received_at')::date, CURRENT_DATE),
    NULLIF(p_payload->>'deadline','')::date,
    NULLIF(p_payload->>'process_id','')::uuid,
    COALESCE(p_payload->>'status','pendente')
  ) ON CONFLICT DO NOTHING RETURNING id INTO _intim_id;
  IF _intim_id IS NULL THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
  INSERT INTO public.notifications(user_id, title, message, type, link)
  VALUES (
    p_user_id,
    CASE WHEN _is_urgent THEN '⚠️ Intimação URGENTE — prazo ≤ 5 dias úteis' ELSE 'Nova intimação DJEN' END,
    COALESCE(p_payload->>'notification_message','Nova intimação registrada'),
    CASE WHEN _is_urgent THEN 'destructive' ELSE 'warning' END,
    '/intimacoes'
  );
  IF _is_urgent AND (p_payload->'urgent_email') IS NOT NULL THEN
    PERFORM public.enqueue_email('transactional_emails', p_payload->'urgent_email');
  END IF;
  RETURN jsonb_build_object('ok',true,'intimation_id',_intim_id,'urgent',_is_urgent);
END; $$;
REVOKE ALL ON FUNCTION public.record_intimation(uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_intimation(uuid,text,jsonb) FROM authenticated;

-- Sprint 2.8 — truncated tracking
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false;
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS pages_fetched integer;
CREATE INDEX IF NOT EXISTS idx_sync_logs_truncated ON public.sync_logs(truncated, created_at) WHERE truncated = true;

-- Sec-3.4 — captcha gating field
ALTER TABLE public.auth_lockouts ADD COLUMN IF NOT EXISTS recent_failures integer NOT NULL DEFAULT 0;