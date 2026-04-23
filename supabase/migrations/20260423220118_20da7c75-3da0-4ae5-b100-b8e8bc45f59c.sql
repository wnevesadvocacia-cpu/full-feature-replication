-- Versionamento de documentos/petições
CREATE TABLE public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_id UUID,
  document_id UUID,
  version_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  change_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY dv_select ON public.document_versions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY dv_insert ON public.document_versions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY dv_delete ON public.document_versions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_dv_template ON public.document_versions(template_id);
CREATE INDEX idx_dv_document ON public.document_versions(document_id);

-- Colunas customizáveis do Kanban CRM
CREATE TABLE public.kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  status_key TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, status_key)
);

ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY kc_select ON public.kanban_columns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY kc_insert ON public.kanban_columns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY kc_update ON public.kanban_columns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY kc_delete ON public.kanban_columns FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_kc_updated BEFORE UPDATE ON public.kanban_columns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();