-- P0 #4: Dedup intimations + UNIQUE constraint para impedir reentrada de duplicatas

-- 1) Remove duplicatas mantendo o registro mais antigo (menor created_at) por (user_id, external_id)
DELETE FROM public.intimations a
USING public.intimations b
WHERE a.external_id IS NOT NULL
  AND a.external_id = b.external_id
  AND a.user_id = b.user_id
  AND (a.created_at, a.id) > (b.created_at, b.id);

-- 2) Para registros SEM external_id: dedup por (user_id, received_at, court, content)
DELETE FROM public.intimations a
USING public.intimations b
WHERE a.external_id IS NULL
  AND b.external_id IS NULL
  AND a.user_id = b.user_id
  AND a.received_at = b.received_at
  AND COALESCE(a.court,'') = COALESCE(b.court,'')
  AND md5(a.content) = md5(b.content)
  AND (a.created_at, a.id) > (b.created_at, b.id);

-- 3) UNIQUE índice parcial (apenas onde external_id existe — não bloqueia inserções manuais)
CREATE UNIQUE INDEX IF NOT EXISTS intimations_user_external_unique
  ON public.intimations (user_id, external_id)
  WHERE external_id IS NOT NULL;

-- 4) UNIQUE para fallback (registros manuais sem external_id) — usa hash determinístico
CREATE UNIQUE INDEX IF NOT EXISTS intimations_user_manual_unique
  ON public.intimations (user_id, received_at, COALESCE(court,''), md5(content))
  WHERE external_id IS NULL;