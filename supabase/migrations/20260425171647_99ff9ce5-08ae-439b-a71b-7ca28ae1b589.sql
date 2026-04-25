-- Enum de status de classificação
DO $$ BEGIN
  CREATE TYPE public.intimation_classification_status AS ENUM (
    'auto_alta',
    'auto_media',
    'auto_baixa',
    'revisada_advogado',
    'ambigua_urgente'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.intimations
  ADD COLUMN IF NOT EXISTS peca_sugerida jsonb,
  ADD COLUMN IF NOT EXISTS base_legal text,
  ADD COLUMN IF NOT EXISTS confianca_classificacao numeric(3,2)
    CHECK (confianca_classificacao IS NULL OR (confianca_classificacao >= 0 AND confianca_classificacao <= 1)),
  ADD COLUMN IF NOT EXISTS classificacao_status public.intimation_classification_status;

CREATE INDEX IF NOT EXISTS idx_intimations_classificacao_status
  ON public.intimations(classificacao_status)
  WHERE classificacao_status IS NOT NULL;

COMMENT ON COLUMN public.intimations.peca_sugerida IS 'JSONB {peca, fundamento_legal, prazo_dias, observacoes, peca_alternativa?} sugerido pelo detector';
COMMENT ON COLUMN public.intimations.base_legal IS 'Diploma/artigo aplicado (ex.: CPC art. 1.026 §1º)';
COMMENT ON COLUMN public.intimations.confianca_classificacao IS 'Score 0..1 da heurística; <0.8 exige revisão manual';
COMMENT ON COLUMN public.intimations.classificacao_status IS 'auto_alta|auto_media|auto_baixa|revisada_advogado|ambigua_urgente';