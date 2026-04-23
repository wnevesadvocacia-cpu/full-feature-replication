
CREATE TABLE public.time_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  process_id UUID,
  client_id UUID,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  description TEXT,
  billable BOOLEAN NOT NULL DEFAULT true,
  invoiced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "te_select" ON public.time_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "te_insert" ON public.time_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "te_update" ON public.time_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "te_delete" ON public.time_entries FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER te_updated BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_te_user_date ON public.time_entries(user_id, date DESC);
CREATE INDEX idx_te_process ON public.time_entries(process_id);

CREATE TABLE public.fee_agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  process_id UUID,
  client_id UUID,
  type TEXT NOT NULL DEFAULT 'fixo', -- fixo | exito | hora | parcelado
  fixed_amount NUMERIC(12,2),
  success_percent NUMERIC(5,2),
  hourly_rate NUMERIC(10,2),
  installments_count INT,
  installments_paid INT NOT NULL DEFAULT 0,
  total_estimated NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'ativo', -- ativo | encerrado | cancelado
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fee_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fa_select" ON public.fee_agreements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "fa_insert" ON public.fee_agreements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fa_update" ON public.fee_agreements FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "fa_delete" ON public.fee_agreements FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER fa_updated BEFORE UPDATE ON public.fee_agreements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_fa_user ON public.fee_agreements(user_id);
CREATE INDEX idx_fa_process ON public.fee_agreements(process_id);
