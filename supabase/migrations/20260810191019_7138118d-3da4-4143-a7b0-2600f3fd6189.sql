UPDATE public.intimations
SET classificacao_status = 'auto_alta',
    confianca_classificacao = 0.93,
    base_legal = 'Comunicação de migração de sistema processual — mera ciência, sem prazo (CPC art. 218 §3º)',
    peca_sugerida = jsonb_build_object(
      'peca','Ciência (sem peça devida)',
      'fundamento_legal','Res. CNJ — tramitação eletrônica',
      'prazo_dias',0,
      'observacoes','Publicação apenas cientifica as partes de que o processo passará a tramitar em outro sistema eletrônico (credenciamento/verificação cadastral). Não há prazo processual em curso.'
    ),
    deadline_sugerido_inseguro = NULL,
    updated_at = now()
WHERE deadline IS NULL
  AND classificacao_status <> 'auto_alta'
  AND (
    content ILIKE '%passará a tramitar%sistema%'
    OR content ILIKE '%credenciamento no eproc%'
    OR content ILIKE '%comunicações subsequentes serão realizadas pelo sistema%'
  );