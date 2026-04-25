ALTER TABLE public.intimations
  ADD COLUMN IF NOT EXISTS deadline_sugerido_inseguro jsonb;

COMMENT ON COLUMN public.intimations.deadline_sugerido_inseguro IS
  'Sugestão automática de prazo NÃO confiável (confianca < 0.8). Armazenada apenas para auditoria — UI NÃO deve renderizar como prazo oficial. Estrutura: {due_date, start_date, days, unit, label, confianca, classificacao_status, calculated_at}';