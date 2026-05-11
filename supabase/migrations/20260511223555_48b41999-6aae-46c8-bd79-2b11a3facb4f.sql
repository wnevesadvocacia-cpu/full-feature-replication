ALTER TABLE public.intimations
  ADD COLUMN IF NOT EXISTS deadline_canonical_v2 date,
  ADD COLUMN IF NOT EXISTS classification_canonical_v2 jsonb;

CREATE INDEX IF NOT EXISTS idx_intimations_v2_diff
  ON public.intimations (id)
  WHERE deadline_canonical_v2 IS NOT NULL;

COMMENT ON COLUMN public.intimations.deadline_canonical_v2
  IS 'Backfill shadow: deadline calculado pelo detectDeadline v2. Não usar em produção até cutover.';
COMMENT ON COLUMN public.intimations.classification_canonical_v2
  IS 'Backfill shadow: {status, triggerSource, days, peca, base_legal, confianca, matchedText}.';