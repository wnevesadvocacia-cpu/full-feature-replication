DROP POLICY IF EXISTS admin_select_client_portal_tokens ON public.client_portal_tokens;
DROP POLICY IF EXISTS admin_update_client_portal_tokens ON public.client_portal_tokens;
DROP POLICY IF EXISTS admin_delete_client_portal_tokens ON public.client_portal_tokens;

CREATE POLICY cpt_admin_delete ON public.client_portal_tokens
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY service_role_insert_djen_proxy_config ON public.djen_proxy_config
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role));