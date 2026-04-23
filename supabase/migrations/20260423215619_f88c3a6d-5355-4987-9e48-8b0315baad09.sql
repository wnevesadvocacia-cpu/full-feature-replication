-- Tabela de solicitações de assinatura
CREATE TABLE public.signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  client_id UUID NOT NULL,
  document_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | assinado | recusado | expirado
  signature_data_url TEXT, -- base64 da assinatura (imagem)
  signed_at TIMESTAMPTZ,
  signer_name TEXT,
  signer_ip TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY sr_select ON public.signature_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sr_insert ON public.signature_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY sr_update ON public.signature_requests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY sr_delete ON public.signature_requests FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_sr_updated BEFORE UPDATE ON public.signature_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_sr_client ON public.signature_requests(client_id);
CREATE INDEX idx_sr_status ON public.signature_requests(status);

-- RPC pública: lista assinaturas pendentes pelo token do portal
CREATE OR REPLACE FUNCTION public.get_portal_signatures(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_id UUID;
  _user_id UUID;
BEGIN
  SELECT client_id, user_id INTO _client_id, _user_id
  FROM public.client_portal_tokens
  WHERE token = _token AND active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF _client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_or_expired_token');
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'description', description,
      'status', status, 'signed_at', signed_at, 'created_at', created_at,
      'expires_at', expires_at
    ) ORDER BY created_at DESC)
    FROM public.signature_requests
    WHERE client_id = _client_id AND user_id = _user_id
  ), '[]'::jsonb);
END; $$;

-- RPC pública: cliente registra assinatura
CREATE OR REPLACE FUNCTION public.sign_portal_document(
  _token TEXT,
  _request_id UUID,
  _signature_data_url TEXT,
  _signer_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_id UUID;
  _user_id UUID;
  _row public.signature_requests;
BEGIN
  SELECT client_id, user_id INTO _client_id, _user_id
  FROM public.client_portal_tokens
  WHERE token = _token AND active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF _client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_or_expired_token');
  END IF;

  SELECT * INTO _row FROM public.signature_requests
  WHERE id = _request_id AND client_id = _client_id AND user_id = _user_id;

  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF _row.status <> 'pendente' THEN
    RETURN jsonb_build_object('error', 'already_signed_or_expired');
  END IF;

  IF _row.expires_at IS NOT NULL AND _row.expires_at < now() THEN
    UPDATE public.signature_requests SET status = 'expirado' WHERE id = _request_id;
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  UPDATE public.signature_requests
  SET status = 'assinado',
      signature_data_url = _signature_data_url,
      signer_name = _signer_name,
      signed_at = now()
  WHERE id = _request_id;

  -- Notifica o advogado
  INSERT INTO public.notifications(user_id, title, message, type, link)
  VALUES (_user_id, 'Documento assinado',
    COALESCE(_signer_name, 'Cliente') || ' assinou: ' || _row.title,
    'success', '/portal-acessos');

  RETURN jsonb_build_object('success', true);
END; $$;