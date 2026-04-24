-- Logs de cada execução de sincronização
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  oab_settings_id UUID,
  oab_number TEXT,
  oab_uf TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  items_found INTEGER DEFAULT 0,
  items_inserted INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  triggered_by TEXT DEFAULT 'cron',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_logs_user_idx ON public.sync_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sync_logs_oab_idx ON public.sync_logs(oab_settings_id, created_at DESC);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own sync logs" ON public.sync_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "admin gerente view all sync logs" ON public.sync_logs
  FOR SELECT USING (can_delete(auth.uid()));

-- Rastreio de falhas em oab_settings
ALTER TABLE public.oab_settings
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;