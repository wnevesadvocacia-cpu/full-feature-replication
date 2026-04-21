-- Migration: Extend schema for AdvBox full parity
-- Run this in Supabase Studio SQL editor

-- 1. Extend processes table
ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS opponent TEXT,
  ADD COLUMN IF NOT EXISTS group_action BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS protocol TEXT,
  ADD COLUMN IF NOT EXISTS comarca TEXT,
  ADD COLUMN IF NOT EXISTS vara TEXT,
  ADD COLUMN IF NOT EXISTS tribunal TEXT,
  ADD COLUMN IF NOT EXISTS closing_date DATE,
  ADD COLUMN IF NOT EXISTS transit_date DATE,
  ADD COLUMN IF NOT EXISTS archive_date DATE,
  ADD COLUMN IF NOT EXISTS result TEXT,
  ADD COLUMN IF NOT EXISTS cause_value NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS honorarios_valor NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS honorarios_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS contingency NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS responsible TEXT,
  ADD COLUMN IF NOT EXISTS last_update TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observations TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS originating_process TEXT,
  ADD COLUMN IF NOT EXISTS case_folder TEXT,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS request_date DATE,
  ADD COLUMN IF NOT EXISTS segment TEXT;

-- 2. Extend clients table  
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS marital_status TEXT,
  ADD COLUMN IF NOT EXISTS pis_pasep TEXT,
  ADD COLUMN IF NOT EXISTS ctps TEXT,
  ADD COLUMN IF NOT EXISTS cid TEXT,
  ADD COLUMN IF NOT EXISTS profession TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Brasil',
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS zip_code TEXT,
  ADD COLUMN IF NOT EXISTS mother_name TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Fix processes status constraint to include all AdvBox statuses
ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_status_check;
ALTER TABLE processes ADD CONSTRAINT processes_status_check
  CHECK (status IN ('novo','em_andamento','aguardando','concluido','ativo','arquivado','recursal','sobrestamento','active','archived','pending','closed'));

-- 4. Create documents table (if not exists)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  mime_type TEXT DEFAULT 'application/octet-stream',
  process_id UUID REFERENCES processes(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage documents" ON documents;
CREATE POLICY "Authenticated users can manage documents" ON documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Create conversations table (for compromissos/agenda)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'compromisso',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  location TEXT,
  process_id UUID REFERENCES processes(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  assigned_to TEXT,
  status TEXT DEFAULT 'pendente',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage conversations" ON conversations;
CREATE POLICY "Authenticated users can manage conversations" ON conversations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Create movimentacoes table
CREATE TABLE IF NOT EXISTS movimentacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID REFERENCES processes(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  type TEXT DEFAULT 'outros',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage movimentacoes" ON movimentacoes;
CREATE POLICY "Authenticated users can manage movimentacoes" ON movimentacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Storage bucket for documents (run separately if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true)
-- ON CONFLICT (id) DO NOTHING;
