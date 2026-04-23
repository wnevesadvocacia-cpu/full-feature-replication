-- Tabela de tokens do portal do cliente
CREATE TABLE public.client_portal_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpt_select" ON public.client_portal_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cpt_insert" ON public.client_portal_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cpt_update" ON public.client_portal_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cpt_delete" ON public.client_portal_tokens FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_cpt_token ON public.client_portal_tokens(token) WHERE active = true;

-- RPC pública para consulta via token
CREATE OR REPLACE FUNCTION public.get_client_portal_data(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_id UUID;
  _user_id UUID;
  _result JSONB;
BEGIN
  SELECT client_id, user_id INTO _client_id, _user_id
  FROM public.client_portal_tokens
  WHERE token = _token AND active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF _client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_or_expired_token');
  END IF;

  SELECT jsonb_build_object(
    'client', (SELECT to_jsonb(c) - 'document' - 'rg' FROM (SELECT name, type, email, phone FROM public.clients WHERE id = _client_id) c),
    'processes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'number', p.number, 'title', p.title,
        'status', p.status, 'phase', p.phase, 'stage', p.stage,
        'tribunal', p.tribunal, 'comarca', p.comarca, 'vara', p.vara,
        'last_update', p.last_update, 'value', p.value
      ) ORDER BY p.updated_at DESC)
      FROM public.processes p
      WHERE p.client_id = _client_id AND p.user_id = _user_id
    ), '[]'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'number', i.number, 'amount', i.amount, 'status', i.status,
        'due_date', i.due_date, 'paid_date', i.paid_date, 'description', i.description
      ) ORDER BY i.created_at DESC)
      FROM public.invoices i
      WHERE i.client_id = _client_id AND i.user_id = _user_id
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_client_portal_data(TEXT) TO anon, authenticated;