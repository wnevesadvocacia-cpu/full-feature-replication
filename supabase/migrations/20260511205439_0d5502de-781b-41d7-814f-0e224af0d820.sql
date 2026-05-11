ALTER TABLE public.intimations_backup_pre_prefix_fix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_select_intim_backup"
ON public.intimations_backup_pre_prefix_fix
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));