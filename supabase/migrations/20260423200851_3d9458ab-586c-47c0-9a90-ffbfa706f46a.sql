-- ── PROCESSES: adicionar colunas faltantes ────────────────────────────────────
ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS client_name        text,
  ADD COLUMN IF NOT EXISTS comarca            text,
  ADD COLUMN IF NOT EXISTS vara               text,
  ADD COLUMN IF NOT EXISTS tribunal           text,
  ADD COLUMN IF NOT EXISTS opponent           text,
  ADD COLUMN IF NOT EXISTS phase              text,
  ADD COLUMN IF NOT EXISTS stage              text,
  ADD COLUMN IF NOT EXISTS responsible        text,
  ADD COLUMN IF NOT EXISTS honorarios_valor   numeric(12,2),
  ADD COLUMN IF NOT EXISTS honorarios_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS cause_value        numeric(14,2),
  ADD COLUMN IF NOT EXISTS contingency        numeric(14,2),
  ADD COLUMN IF NOT EXISTS last_update        date,
  ADD COLUMN IF NOT EXISTS observations       text,
  ADD COLUMN IF NOT EXISTS request_date       date,
  ADD COLUMN IF NOT EXISTS closing_date       date,
  ADD COLUMN IF NOT EXISTS result             text;

-- Permitir todos os status usados na UI
ALTER TABLE public.processes DROP CONSTRAINT IF EXISTS processes_status_check;
ALTER TABLE public.processes ADD CONSTRAINT processes_status_check
  CHECK (status = ANY (ARRAY[
    'novo','em_andamento','aguardando','concluido',
    'ativo','arquivado','recursal','sobrestamento'
  ]));

-- ── CLIENTS: adicionar colunas faltantes ──────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS rg              text,
  ADD COLUMN IF NOT EXISTS birth_date      date,
  ADD COLUMN IF NOT EXISTS marital_status  text,
  ADD COLUMN IF NOT EXISTS nationality     text,
  ADD COLUMN IF NOT EXISTS occupation      text;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_status_check
  CHECK (status = ANY (ARRAY['ativo','inativo','prospecto']));

-- ── OFFICE SETTINGS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.office_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        text,
  cnpj        text,
  endereco    text,
  cidade      text,
  estado      text,
  telefone    text,
  email       text,
  site        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.office_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own office settings" ON public.office_settings;
DROP POLICY IF EXISTS "Users insert own office settings" ON public.office_settings;
DROP POLICY IF EXISTS "Users update own office settings" ON public.office_settings;
DROP POLICY IF EXISTS "Users delete own office settings" ON public.office_settings;

CREATE POLICY "Users view own office settings"   ON public.office_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own office settings" ON public.office_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own office settings" ON public.office_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own office settings" ON public.office_settings FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_office_settings_updated_at ON public.office_settings;
CREATE TRIGGER update_office_settings_updated_at
  BEFORE UPDATE ON public.office_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── NOTIFICATION PREFERENCES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  vencimento_processo   boolean NOT NULL DEFAULT true,
  nova_tarefa           boolean NOT NULL DEFAULT true,
  tarefa_concluida      boolean NOT NULL DEFAULT false,
  novo_cliente          boolean NOT NULL DEFAULT false,
  fatura_vencida        boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notif prefs" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users insert own notif prefs" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users update own notif prefs" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users delete own notif prefs" ON public.notification_preferences;

CREATE POLICY "Users view own notif prefs"   ON public.notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notif prefs" ON public.notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notif prefs" ON public.notification_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own notif prefs" ON public.notification_preferences FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();