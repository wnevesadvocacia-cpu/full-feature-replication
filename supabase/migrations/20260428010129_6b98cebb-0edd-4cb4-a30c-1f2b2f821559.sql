ALTER TABLE public.oab_settings
  ADD COLUMN IF NOT EXISTS lawyer_name TEXT,
  ADD COLUMN IF NOT EXISTS name_variations TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS name_match_threshold NUMERIC NOT NULL DEFAULT 0.85;

COMMENT ON COLUMN public.oab_settings.lawyer_name IS 'Nome completo do advogado para validar destinatário das publicações DJEN (fuzzy match).';
COMMENT ON COLUMN public.oab_settings.name_variations IS 'Variações aceitas do nome (apelidos, grafias alternativas).';
COMMENT ON COLUMN public.oab_settings.name_match_threshold IS 'Similaridade mínima (0..1) para aceitar publicação. Default 0.85 = tolera ~1-2 typos.';