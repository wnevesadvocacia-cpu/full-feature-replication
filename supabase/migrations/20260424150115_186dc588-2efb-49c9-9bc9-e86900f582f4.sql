-- Remove restrição de OAB única por usuário (se existir) para permitir múltiplas seccionais
ALTER TABLE public.oab_settings DROP CONSTRAINT IF EXISTS oab_settings_user_id_key;
DROP INDEX IF EXISTS oab_settings_user_id_key;

-- Garante que não haja duplicata da mesma OAB+UF para o mesmo usuário
CREATE UNIQUE INDEX IF NOT EXISTS oab_settings_user_number_uf_unique
  ON public.oab_settings (user_id, oab_number, oab_uf);