
-- 1. Tabela oab_settings
CREATE TABLE public.oab_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  oab_number text NOT NULL,
  oab_uf text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oab_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oab_select" ON public.oab_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "oab_insert" ON public.oab_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "oab_update" ON public.oab_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "oab_delete" ON public.oab_settings FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_oab_updated BEFORE UPDATE ON public.oab_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Deduplicação em intimations
ALTER TABLE public.intimations ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.intimations ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS idx_intim_user_external ON public.intimations(user_id, external_id) WHERE external_id IS NOT NULL;

-- 3. Habilitar extensões para cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
