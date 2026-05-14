-- 1. Backup completo (manter por 30 dias)
CREATE TABLE public.intimations_backup_pre_user_consolidation AS
SELECT * FROM public.intimations;

ALTER TABLE public.intimations_backup_pre_user_consolidation ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_select_intim_backup_consolidation
ON public.intimations_backup_pre_user_consolidation
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Desativa OAB da conta secundária (yahoo) para evitar re-criação por sync
UPDATE public.oab_settings
SET active = false, updated_at = now()
WHERE user_id = '5faaa800-21ae-4140-b142-7c4e1a13de1e';

-- 3. Remove intimações da conta secundária (todas espelhadas na gmail via external_id)
DELETE FROM public.intimations
WHERE user_id = '5faaa800-21ae-4140-b142-7c4e1a13de1e';