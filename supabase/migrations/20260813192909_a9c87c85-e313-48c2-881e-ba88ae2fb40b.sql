UPDATE public.intimations
SET deadline = NULL,
    deadline_canonical_v2 = NULL,
    classificacao_status = 'auto_alta',
    confianca_classificacao = 0.96,
    base_legal = 'Expediente administrativo de distribuição/entrada de autos — não abre prazo recursal',
    peca_sugerida = jsonb_build_object(
      'peca','Ciência (sem peça devida)',
      'fundamento_legal','Distribuição/entrada de autos — ato informativo',
      'prazo_dias',0,
      'observacoes','Publicação apenas informa a entrada dos autos no tribunal. A classe processual e os rótulos das partes não abrem novo prazo recursal.'
    )
WHERE content ~* '(processo entrado em|entrada de autos)'
  AND content !~* '(manifeste-se|apresente|contrarraz|recolha|comprove|sob pena)';