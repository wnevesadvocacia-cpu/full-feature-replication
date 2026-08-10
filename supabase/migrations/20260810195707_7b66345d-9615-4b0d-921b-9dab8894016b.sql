UPDATE public.intimations
SET deadline = '2026-09-01',
    deadline_sugerido_inseguro = NULL,
    classificacao_status = 'auto_alta',
    confianca_classificacao = 0.92,
    base_legal = 'Diligência com prazo expresso de 15 dias (CPC art. 218 §3º c/c Prov. CSM 2.684/2023)',
    updated_at = now()
WHERE content ILIKE '%0004499-68.2026.8.26.0114%'
  AND content ILIKE '%FEDTJ%';