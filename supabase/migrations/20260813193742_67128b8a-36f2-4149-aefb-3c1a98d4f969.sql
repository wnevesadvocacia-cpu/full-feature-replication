UPDATE public.intimations
SET deadline = NULL,
    deadline_canonical_v2 = NULL,
    peca_sugerida = jsonb_build_object(
      'peca','Embargos de Declaração',
      'fundamento_legal','CPC art. 1.023 / Lei 9.099 art. 48',
      'prazo_dias',5,
      'observacoes','O acórdão NEGOU PROVIMENTO ao recurso julgado — não cabe protocolar o mesmo recurso novamente. Adotado o prazo mais curto (EDcl, 5 d.u.); conferir cabimento de Recurso Extraordinário (15 d.u.).'
    ),
    base_legal = 'Acórdão que nega provimento ao recurso — EDcl 5 d.u. (CPC art. 1.023 / Lei 9.099 art. 48) ou recurso excepcional 15 d.u.',
    confianca_classificacao = 0.9,
    updated_at = now()
WHERE content ~* 'negar provimento ao agravo interno'
  AND (peca_sugerida->>'peca') ILIKE '%Agravo Interno%';