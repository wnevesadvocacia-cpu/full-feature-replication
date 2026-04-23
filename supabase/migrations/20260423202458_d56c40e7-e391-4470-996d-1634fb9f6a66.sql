
-- 1. document_templates
CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  category text DEFAULT 'geral',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_select" ON public.document_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "templates_insert" ON public.document_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "templates_update" ON public.document_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "templates_delete" ON public.document_templates FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. intimations
CREATE TABLE public.intimations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  process_id uuid REFERENCES public.processes(id) ON DELETE SET NULL,
  court text,
  content text NOT NULL,
  deadline date,
  status text NOT NULL DEFAULT 'pendente',
  received_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.intimations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intim_select" ON public.intimations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "intim_insert" ON public.intimations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "intim_update" ON public.intimations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "intim_delete" ON public.intimations FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_intim_updated BEFORE UPDATE ON public.intimations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'info',
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_select" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notif_update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notif_delete" ON public.notifications FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_notif_user_read ON public.notifications(user_id, read, created_at DESC);

-- 4. Trigger: nova tarefa com prazo próximo
CREATE OR REPLACE FUNCTION public.notify_task_due()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.due_date IS NOT NULL AND NEW.due_date <= CURRENT_DATE + INTERVAL '1 day' AND NEW.completed = false THEN
    INSERT INTO public.notifications(user_id, title, message, type, link)
    VALUES (NEW.user_id, 'Tarefa com prazo próximo', NEW.title, 'warning', '/tarefas');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_task_due AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_due();

-- 5. Trigger: novo processo
CREATE OR REPLACE FUNCTION public.notify_new_process()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications(user_id, title, message, type, link)
  VALUES (NEW.user_id, 'Novo processo cadastrado', NEW.number || ' - ' || NEW.title, 'info', '/processos');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_new_process AFTER INSERT ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_process();

-- 6. Trigger: fatura vencida (em update de status)
CREATE OR REPLACE FUNCTION public.notify_invoice_overdue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'vencida' AND (OLD.status IS NULL OR OLD.status <> 'vencida') THEN
    INSERT INTO public.notifications(user_id, title, message, type, link)
    VALUES (NEW.user_id, 'Fatura vencida', 'Fatura ' || NEW.number, 'destructive', '/financeiro');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_invoice_overdue AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_invoice_overdue();
