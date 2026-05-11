-- Passo 3: backup
CREATE TABLE IF NOT EXISTS public.intimations_backup_pre_prefix_fix AS
SELECT * FROM public.intimations;

-- Passo 5 (antes do 4 para evitar conflito com UNIQUE):
-- remover duplicatas que vão colidir após normalização do prefixo,
-- preservando a linha mais antiga (menor created_at, desempate por id)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, REPLACE(external_id, 'djen:hash:', '')
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.intimations
  WHERE external_id IS NOT NULL
)
DELETE FROM public.intimations
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Passo 4: normalizar prefixo das remanescentes
UPDATE public.intimations
SET external_id = 'djen:hash:' || external_id
WHERE external_id IS NOT NULL
  AND external_id NOT LIKE 'djen:hash:%'
  AND external_id NOT LIKE 'djen:id:%'
  AND external_id NOT LIKE 'djen:sha:%';