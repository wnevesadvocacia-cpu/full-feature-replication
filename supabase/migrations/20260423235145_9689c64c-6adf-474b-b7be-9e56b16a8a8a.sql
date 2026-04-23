-- Remove a política aberta de INSERT em audit_logs
DROP POLICY IF EXISTS "audit_insert_authenticated" ON public.audit_logs;

-- Sem política de INSERT, ninguém pode escrever via API.
-- A função log_audit_event() é SECURITY DEFINER (executa com permissão do owner),
-- então os triggers continuam gravando normalmente, mas usuários comuns
-- não conseguem mais inserir registros forjados via supabase-js.