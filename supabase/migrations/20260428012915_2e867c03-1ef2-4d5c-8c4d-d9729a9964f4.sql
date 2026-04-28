-- Permitir tipo 'anotacao'
ALTER TABLE public.process_comments DROP CONSTRAINT IF EXISTS process_comments_type_check;
ALTER TABLE public.process_comments ADD CONSTRAINT process_comments_type_check
  CHECK (type = ANY (ARRAY['comentario','andamento','despacho','publicacao','conclusao','documento','anotacao']));

-- Corrigir anotações disfarçadas
ALTER TABLE public.process_comments DISABLE TRIGGER USER;
UPDATE public.process_comments
SET type = 'anotacao',
    content = REGEXP_REPLACE(content, '^\[ANOTACAO\]\s*', '')
WHERE type = 'comentario' AND content LIKE '[ANOTACAO]%';
ALTER TABLE public.process_comments ENABLE TRIGGER USER;

-- Configurar nome do advogado
UPDATE public.oab_settings
SET lawyer_name = 'William Robson das Neves',
    name_variations = ARRAY['Willian Robson das Neves','William R. das Neves','W. R. das Neves'],
    name_match_threshold = 0.85
WHERE oab_number = '290702' AND oab_uf = 'SP';