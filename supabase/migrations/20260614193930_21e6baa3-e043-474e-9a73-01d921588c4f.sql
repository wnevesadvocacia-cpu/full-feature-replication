DROP POLICY IF EXISTS admin_select_intim_backup ON public.intimations_backup_pre_prefix_fix;
CREATE POLICY admin_select_intim_backup ON public.intimations_backup_pre_prefix_fix
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND user_id = auth.uid());

DROP POLICY IF EXISTS admin_select_intim_backup_consolidation ON public.intimations_backup_pre_user_consolidation;
CREATE POLICY admin_select_intim_backup_consolidation ON public.intimations_backup_pre_user_consolidation
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND user_id = auth.uid());