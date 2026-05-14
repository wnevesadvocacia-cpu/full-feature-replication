-- (A) user_notification_prefs
CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT,
  daily_digest_enabled BOOLEAN NOT NULL DEFAULT true,
  digest_hour_brt SMALLINT NOT NULL DEFAULT 8 CHECK (digest_hour_brt BETWEEN 0 AND 23),
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_phone TEXT,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (B) email_digest_log
CREATE TABLE IF NOT EXISTS public.email_digest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  novas_count INTEGER NOT NULL DEFAULT 0,
  pendentes_count INTEGER NOT NULL DEFAULT 0,
  resend_id TEXT,
  resend_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (C) backup_log
CREATE TABLE IF NOT EXISTS public.backup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  date DATE NOT NULL UNIQUE,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (D) RLS
ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_digest_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_log             ENABLE ROW LEVEL SECURITY;

-- prefs: dono lê/insere/atualiza/deleta os próprios
DROP POLICY IF EXISTS unp_select ON public.user_notification_prefs;
DROP POLICY IF EXISTS unp_insert ON public.user_notification_prefs;
DROP POLICY IF EXISTS unp_update ON public.user_notification_prefs;
DROP POLICY IF EXISTS unp_delete ON public.user_notification_prefs;
DROP POLICY IF EXISTS unp_service_all ON public.user_notification_prefs;

CREATE POLICY unp_select ON public.user_notification_prefs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY unp_insert ON public.user_notification_prefs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY unp_update ON public.user_notification_prefs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY unp_delete ON public.user_notification_prefs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY unp_service_all ON public.user_notification_prefs
  FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- email_digest_log: dono lê os próprios; service_role escreve
DROP POLICY IF EXISTS edl_select ON public.email_digest_log;
DROP POLICY IF EXISTS edl_service_all ON public.email_digest_log;

CREATE POLICY edl_select ON public.email_digest_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY edl_service_all ON public.email_digest_log
  FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- backup_log: admin-only leitura; service_role escreve
DROP POLICY IF EXISTS bl_select_admin ON public.backup_log;
DROP POLICY IF EXISTS bl_service_all ON public.backup_log;

CREATE POLICY bl_select_admin ON public.backup_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY bl_service_all ON public.backup_log
  FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- (E) Indexes
CREATE INDEX IF NOT EXISTS idx_unp_digest_enabled
  ON public.user_notification_prefs(daily_digest_enabled)
  WHERE daily_digest_enabled = true;

CREATE INDEX IF NOT EXISTS idx_edl_user_sent
  ON public.email_digest_log(user_id, sent_at DESC);

-- (G) Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- trigger updated_at em user_notification_prefs
DROP TRIGGER IF EXISTS trg_unp_updated_at ON public.user_notification_prefs;
CREATE TRIGGER trg_unp_updated_at
  BEFORE UPDATE ON public.user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();