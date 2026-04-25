-- ===== GAP 2: judicial_suspensions (suspensões/portarias) =====
CREATE TABLE IF NOT EXISTS public.judicial_suspensions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tribunal_codigo TEXT,            -- NULL = abrange CNJ/todos os tribunais
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT judicial_suspensions_period_chk CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_judicial_suspensions_period ON public.judicial_suspensions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_judicial_suspensions_tribunal ON public.judicial_suspensions(tribunal_codigo);
ALTER TABLE public.judicial_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "everyone authenticated can read suspensions"
  ON public.judicial_suspensions FOR SELECT TO authenticated USING (true);
CREATE POLICY "only admin insert suspensions"
  ON public.judicial_suspensions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "only admin update suspensions"
  ON public.judicial_suspensions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "only admin delete suspensions"
  ON public.judicial_suspensions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ===== GAP 3: tribunal_holidays (feriados estaduais por tribunal) =====
CREATE TABLE IF NOT EXISTS public.tribunal_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tribunal_codigo TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tribunal_codigo, holiday_date)
);
CREATE INDEX IF NOT EXISTS idx_tribunal_holidays_lookup ON public.tribunal_holidays(tribunal_codigo, holiday_date);
ALTER TABLE public.tribunal_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "everyone authenticated can read tribunal holidays"
  ON public.tribunal_holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "only admin manage tribunal holidays"
  ON public.tribunal_holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Pré-popular TJSP e TJRJ para 2024-2027 (datas fixas anuais)
DO $$
DECLARE y INT;
BEGIN
  FOR y IN 2024..2027 LOOP
    -- TJSP: aniversário SP (25/01) e Revolução Constitucionalista (09/07)
    INSERT INTO public.tribunal_holidays (tribunal_codigo, holiday_date, description) VALUES
      ('TJSP', make_date(y,1,25), 'Aniversário de São Paulo'),
      ('TJSP', make_date(y,7,9),  'Revolução Constitucionalista')
    ON CONFLICT DO NOTHING;
    -- TJRJ: São Sebastião (20/01) e São Jorge (23/04)
    INSERT INTO public.tribunal_holidays (tribunal_codigo, holiday_date, description) VALUES
      ('TJRJ', make_date(y,1,20), 'São Sebastião - padroeiro do RJ'),
      ('TJRJ', make_date(y,4,23), 'São Jorge')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ===== GAP 4: Realtime em intimations, processes, tasks =====
ALTER TABLE public.intimations REPLICA IDENTITY FULL;
ALTER TABLE public.processes   REPLICA IDENTITY FULL;
ALTER TABLE public.tasks       REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.intimations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.processes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;