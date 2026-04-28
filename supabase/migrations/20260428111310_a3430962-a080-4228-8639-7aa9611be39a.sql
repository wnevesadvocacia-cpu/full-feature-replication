
CREATE TABLE IF NOT EXISTS public.djen_proxy_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  proxy_url text,
  validated_at timestamptz,
  validated_by uuid,
  last_status text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.djen_proxy_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.djen_proxy_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_djen_proxy_config" ON public.djen_proxy_config
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_update_djen_proxy_config" ON public.djen_proxy_config
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "service_role_all_djen_proxy_config" ON public.djen_proxy_config
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
