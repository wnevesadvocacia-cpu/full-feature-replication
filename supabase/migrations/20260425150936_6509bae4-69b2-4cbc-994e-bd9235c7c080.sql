-- Sec-2.1: Remover assign_first_user_admin (vulnerabilidade S16: privilege escalation)
-- Confirmado: já existe 1 admin (5faaa800-...) — seguro remover.
DROP TRIGGER IF EXISTS on_auth_user_created_assign_admin ON auth.users;
DROP TRIGGER IF EXISTS assign_first_user_admin_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.assign_first_user_admin() CASCADE;

-- Sec-2.2: tabela de lockouts (proteção brute-force OTP) + rate-limit por IP.
CREATE TABLE IF NOT EXISTS public.auth_lockouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  failed_count int NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email)
);
CREATE INDEX IF NOT EXISTS idx_auth_lockouts_email ON public.auth_lockouts(email);
CREATE INDEX IF NOT EXISTS idx_auth_lockouts_blocked_until ON public.auth_lockouts(blocked_until) WHERE blocked_until IS NOT NULL;

ALTER TABLE public.auth_lockouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_auth_lockouts" ON public.auth_lockouts
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "admin_select_auth_lockouts" ON public.auth_lockouts
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Tabela de rate-limit por IP (substitui Deno KV indisponível em Edge Functions free)
CREATE TABLE IF NOT EXISTS public.ip_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  endpoint text NOT NULL,
  request_count int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ip_hash, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_ip_rate_limits_window ON public.ip_rate_limits(window_start);

ALTER TABLE public.ip_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_ip_rate_limits" ON public.ip_rate_limits
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "admin_select_ip_rate_limits" ON public.ip_rate_limits
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RPC atômico de check+increment (evita race condition cliente)
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  _ip_hash text, _endpoint text, _max int, _window_minutes int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.ip_rate_limits;
  _window_start timestamptz := now() - (_window_minutes || ' minutes')::interval;
BEGIN
  SELECT * INTO _row FROM public.ip_rate_limits
   WHERE ip_hash = _ip_hash AND endpoint = _endpoint;

  IF _row.id IS NULL THEN
    INSERT INTO public.ip_rate_limits(ip_hash, endpoint) VALUES (_ip_hash, _endpoint);
    RETURN jsonb_build_object('allowed', true, 'count', 1);
  END IF;

  IF _row.window_start < _window_start THEN
    UPDATE public.ip_rate_limits
       SET request_count = 1, window_start = now()
     WHERE id = _row.id;
    RETURN jsonb_build_object('allowed', true, 'count', 1);
  END IF;

  IF _row.request_count >= _max THEN
    RETURN jsonb_build_object('allowed', false, 'count', _row.request_count, 'reset_at', _row.window_start + (_window_minutes || ' minutes')::interval);
  END IF;

  UPDATE public.ip_rate_limits
     SET request_count = request_count + 1
   WHERE id = _row.id;
  RETURN jsonb_build_object('allowed', true, 'count', _row.request_count + 1);
END; $$;

-- RPC: registra falha de OTP + bloqueia 15min após 5 falhas
CREATE OR REPLACE FUNCTION public.register_otp_failure(_email text, _max int DEFAULT 5, _block_minutes int DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.auth_lockouts;
  _new_count int;
  _blocked_until timestamptz;
BEGIN
  SELECT * INTO _row FROM public.auth_lockouts WHERE email = _email;
  IF _row.id IS NULL THEN
    INSERT INTO public.auth_lockouts(email, failed_count, last_attempt_at)
    VALUES (_email, 1, now()) RETURNING * INTO _row;
    RETURN jsonb_build_object('failed_count', 1, 'blocked', false);
  END IF;

  _new_count := _row.failed_count + 1;
  IF _new_count >= _max THEN
    _blocked_until := now() + (_block_minutes || ' minutes')::interval;
    UPDATE public.auth_lockouts
       SET failed_count = _new_count, blocked_until = _blocked_until,
           last_attempt_at = now(), updated_at = now()
     WHERE id = _row.id;
    RETURN jsonb_build_object('failed_count', _new_count, 'blocked', true, 'blocked_until', _blocked_until);
  END IF;

  UPDATE public.auth_lockouts
     SET failed_count = _new_count, last_attempt_at = now(), updated_at = now()
   WHERE id = _row.id;
  RETURN jsonb_build_object('failed_count', _new_count, 'blocked', false);
END; $$;

-- RPC: reset em sucesso
CREATE OR REPLACE FUNCTION public.reset_otp_lockout(_email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_lockouts WHERE email = _email;
$$;

-- RPC: verifica se está bloqueado
CREATE OR REPLACE FUNCTION public.is_email_locked(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.auth_lockouts
     WHERE email = _email AND blocked_until IS NOT NULL AND blocked_until > now()
  );
$$;