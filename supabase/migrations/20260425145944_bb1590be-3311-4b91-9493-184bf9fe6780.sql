-- =========================================================================
-- Sprint1.6: cron_runs + advisory lock helper
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  run_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed','aborted')),
  triggered_by text,
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job_status ON public.cron_runs(job_name, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_runs_run_id ON public.cron_runs(run_id);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_gerente_select_cron_runs" ON public.cron_runs;
CREATE POLICY "admin_gerente_select_cron_runs" ON public.cron_runs
  FOR SELECT TO authenticated
  USING (public.can_delete(auth.uid()));

DROP POLICY IF EXISTS "service_role_all_cron_runs" ON public.cron_runs;
CREATE POLICY "service_role_all_cron_runs" ON public.cron_runs
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Helper: tenta lock advisory exclusivo por job_name. Retorna boolean.
CREATE OR REPLACE FUNCTION public.try_acquire_cron_lock(_job_name text)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(hashtext(_job_name));
$$;

CREATE OR REPLACE FUNCTION public.release_cron_lock(_job_name text)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(hashtext(_job_name));
$$;

REVOKE EXECUTE ON FUNCTION public.try_acquire_cron_lock(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_cron_lock(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_cron_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cron_lock(text) TO service_role;

-- =========================================================================
-- Sprint1.9: RPC calculate_deadline
-- Recebe data inicial (data de publicação efetiva), nº de dias úteis e tribunal opcional.
-- Frontend e Edge passam a chamar essa função única para evitar drift de calendário.
-- A regex/identificação do nº de dias permanece no TS (decisão aprovada).
-- =========================================================================

-- Páscoa (Meeus/Jones/Butcher) em SQL — necessária para Carnaval/Sexta Santa/Corpus Christi
CREATE OR REPLACE FUNCTION public._easter_sunday(_year int)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  a int := _year % 19;
  b int := _year / 100;
  c int := _year % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19*a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  L int := (32 + 2*e + 2*i - h - k) % 7;
  m int := (a + 11*h + 22*L) / 451;
  mo int := (h + L - 7*m + 114) / 31;
  da int := ((h + L - 7*m + 114) % 31) + 1;
BEGIN
  RETURN make_date(_year, mo, da);
END;
$$;

CREATE OR REPLACE FUNCTION public._is_business_day(_d date, _tribunal text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _y int := EXTRACT(year FROM _d)::int;
  _easter date := public._easter_sunday(_y);
BEGIN
  -- Sábado/domingo
  IF EXTRACT(dow FROM _d) IN (0, 6) THEN RETURN false; END IF;
  -- Recesso forense 20/12 a 20/01 (CPC art. 220 §1º)
  IF (EXTRACT(month FROM _d) = 12 AND EXTRACT(day FROM _d) >= 20)
     OR (EXTRACT(month FROM _d) = 1 AND EXTRACT(day FROM _d) <= 20) THEN
    RETURN false;
  END IF;
  -- Feriados nacionais fixos
  IF (EXTRACT(month FROM _d), EXTRACT(day FROM _d)) IN (
    (1,1),(4,21),(5,1),(9,7),(10,12),(11,2),(11,15),(11,20),(12,25),(12,8)
  ) THEN
    RETURN false;
  END IF;
  -- Móveis: Carnaval (-48,-47), Sexta Santa (-2), Corpus Christi (+60)
  IF _d IN (_easter - 48, _easter - 47, _easter - 2, _easter + 60) THEN
    RETURN false;
  END IF;
  -- Suspensões gerais (tribunal_codigo IS NULL)
  IF EXISTS (
    SELECT 1 FROM public.judicial_suspensions
    WHERE tribunal_codigo IS NULL
      AND _d BETWEEN start_date AND end_date
  ) THEN RETURN false; END IF;
  -- Suspensões / feriados específicos do tribunal
  IF _tribunal IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.judicial_suspensions
      WHERE upper(tribunal_codigo) = upper(_tribunal)
        AND _d BETWEEN start_date AND end_date
    ) THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM public.tribunal_holidays
      WHERE upper(tribunal_codigo) = upper(_tribunal)
        AND holiday_date = _d
    ) THEN RETURN false; END IF;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public._next_business_day(_d date, _tribunal text DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE _cursor date := _d + 1;
BEGIN
  WHILE NOT public._is_business_day(_cursor, _tribunal) LOOP
    _cursor := _cursor + 1;
  END LOOP;
  RETURN _cursor;
END;
$$;

-- API pública: calcula vencimento.
-- _start_date = data da disponibilização (received_at).
-- Aplica CPC art. 224 §3º: publicação = 1º dia útil após disponibilização;
--                          início da contagem = 1º dia útil após a publicação.
-- Conta _days dias úteis (ou corridos com prorrogação se _unit='dias_corridos')
-- e prorroga vencimento p/ próximo dia útil se cair em não-útil (art. 224 §1º).
CREATE OR REPLACE FUNCTION public.calculate_deadline(
  _start_date date,
  _days int,
  _tribunal text DEFAULT NULL,
  _unit text DEFAULT 'dias_uteis'
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _publicacao date;
  _cursor date;
  _added int := 0;
BEGIN
  IF _start_date IS NULL OR _days IS NULL OR _days <= 0 THEN
    RETURN NULL;
  END IF;

  _publicacao := public._next_business_day(_start_date, _tribunal);

  IF _unit = 'dias_corridos' THEN
    _cursor := _publicacao + _days;
    WHILE NOT public._is_business_day(_cursor, _tribunal) LOOP
      _cursor := _cursor + 1;
    END LOOP;
    RETURN _cursor;
  END IF;

  -- dias úteis
  _cursor := _publicacao;
  WHILE _added < _days LOOP
    _cursor := _cursor + 1;
    IF public._is_business_day(_cursor, _tribunal) THEN
      _added := _added + 1;
    END IF;
  END LOOP;
  -- garantia (caso _days = 0 já tratado acima)
  WHILE NOT public._is_business_day(_cursor, _tribunal) LOOP
    _cursor := _cursor + 1;
  END LOOP;
  RETURN _cursor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_deadline(date, int, text, text) TO authenticated, service_role;