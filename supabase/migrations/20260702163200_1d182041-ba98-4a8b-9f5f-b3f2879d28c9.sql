
CREATE TABLE IF NOT EXISTS public.djen_source_health (
  id int PRIMARY KEY DEFAULT 1,
  current_source text NOT NULL DEFAULT 'djen',
  last_ok_at timestamptz,
  last_fail_at timestamptz,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT djen_source_health_singleton CHECK (id = 1)
);

GRANT SELECT ON public.djen_source_health TO authenticated;
GRANT ALL ON public.djen_source_health TO service_role;

ALTER TABLE public.djen_source_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office members view djen health" ON public.djen_source_health;
CREATE POLICY "office members view djen health"
  ON public.djen_source_health FOR SELECT
  TO authenticated
  USING (public.is_office_member(auth.uid()));

INSERT INTO public.djen_source_health (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
