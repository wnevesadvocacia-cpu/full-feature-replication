-- Recria com SET search_path explícito (linter 0011)
CREATE OR REPLACE FUNCTION public._easter_sunday(_year int)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
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
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _y int := EXTRACT(year FROM _d)::int;
  _easter date := public._easter_sunday(_y);
BEGIN
  IF EXTRACT(dow FROM _d) IN (0, 6) THEN RETURN false; END IF;
  IF (EXTRACT(month FROM _d) = 12 AND EXTRACT(day FROM _d) >= 20)
     OR (EXTRACT(month FROM _d) = 1 AND EXTRACT(day FROM _d) <= 20) THEN
    RETURN false;
  END IF;
  IF (EXTRACT(month FROM _d), EXTRACT(day FROM _d)) IN (
    (1,1),(4,21),(5,1),(9,7),(10,12),(11,2),(11,15),(11,20),(12,25),(12,8)
  ) THEN
    RETURN false;
  END IF;
  IF _d IN (_easter - 48, _easter - 47, _easter - 2, _easter + 60) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.judicial_suspensions
             WHERE tribunal_codigo IS NULL AND _d BETWEEN start_date AND end_date) THEN
    RETURN false;
  END IF;
  IF _tribunal IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.judicial_suspensions
               WHERE upper(tribunal_codigo) = upper(_tribunal)
                 AND _d BETWEEN start_date AND end_date) THEN
      RETURN false;
    END IF;
    IF EXISTS (SELECT 1 FROM public.tribunal_holidays
               WHERE upper(tribunal_codigo) = upper(_tribunal)
                 AND holiday_date = _d) THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public._next_business_day(_d date, _tribunal text DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _cursor date := _d + 1;
BEGIN
  WHILE NOT public._is_business_day(_cursor, _tribunal) LOOP
    _cursor := _cursor + 1;
  END LOOP;
  RETURN _cursor;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_deadline(
  _start_date date,
  _days int,
  _tribunal text DEFAULT NULL,
  _unit text DEFAULT 'dias_uteis'
)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _publicacao date;
  _cursor date;
  _added int := 0;
BEGIN
  IF _start_date IS NULL OR _days IS NULL OR _days <= 0 THEN RETURN NULL; END IF;
  _publicacao := public._next_business_day(_start_date, _tribunal);
  IF _unit = 'dias_corridos' THEN
    _cursor := _publicacao + _days;
    WHILE NOT public._is_business_day(_cursor, _tribunal) LOOP
      _cursor := _cursor + 1;
    END LOOP;
    RETURN _cursor;
  END IF;
  _cursor := _publicacao;
  WHILE _added < _days LOOP
    _cursor := _cursor + 1;
    IF public._is_business_day(_cursor, _tribunal) THEN _added := _added + 1; END IF;
  END LOOP;
  WHILE NOT public._is_business_day(_cursor, _tribunal) LOOP
    _cursor := _cursor + 1;
  END LOOP;
  RETURN _cursor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_deadline(date, int, text, text) TO authenticated, service_role;