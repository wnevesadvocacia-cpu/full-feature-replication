-- Desabilita temporariamente trigger imutável para corrigir created_at sentinela
ALTER TABLE public.process_comments DISABLE TRIGGER trg_prevent_comment_update;

-- Recalcula created_at dos 102 comentários sentinela usando last_update do processo pai
UPDATE public.process_comments pc
SET created_at = COALESCE(p.last_update::timestamptz, p.updated_at, now())
FROM public.processes p
WHERE pc.process_id = p.id
  AND pc.author_name = 'AdvBox (importado)'
  AND pc.created_at < '2001-01-01'::timestamptz;

-- Religa o trigger imutável
ALTER TABLE public.process_comments ENABLE TRIGGER trg_prevent_comment_update;