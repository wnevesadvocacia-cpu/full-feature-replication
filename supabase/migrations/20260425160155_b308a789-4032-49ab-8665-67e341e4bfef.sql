-- 1) FIX search_path nos 4 wrappers pgmq (silencia avisos pré-existentes)
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

-- 2) RPC purge_client — exclusão em cascata APENAS para admin, com snapshot em audit_logs.
-- Usa SECURITY DEFINER para contornar RLS (admin já validado pela checagem has_role).
-- ATENÇÃO: esta operação é IRREVERSÍVEL. O snapshot fica em audit_logs.old_data.
CREATE OR REPLACE FUNCTION public.purge_client(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _client_row public.clients;
  _counts jsonb;
  _process_ids uuid[];
BEGIN
  -- Hard guard: só admin pode chamar.
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: admin only' USING ERRCODE = '42501';
  END IF;

  -- Carrega snapshot do cliente
  SELECT * INTO _client_row FROM public.clients WHERE id = _client_id;
  IF _client_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client_not_found');
  END IF;

  -- Pega processos do cliente (para cascade explícito de tasks/intimations)
  SELECT array_agg(id) INTO _process_ids FROM public.processes WHERE client_id = _client_id;

  -- Conta o que será removido (vai junto no audit log)
  _counts := jsonb_build_object(
    'processes',          COALESCE((SELECT count(*) FROM public.processes WHERE client_id = _client_id), 0),
    'intimations',        COALESCE((SELECT count(*) FROM public.intimations WHERE process_id = ANY(_process_ids)), 0),
    'tasks',              COALESCE((SELECT count(*) FROM public.tasks WHERE process_id = ANY(_process_ids)), 0),
    'documents',          COALESCE((SELECT count(*) FROM public.documents WHERE client_id = _client_id OR process_id = ANY(_process_ids)), 0),
    'fee_agreements',     COALESCE((SELECT count(*) FROM public.fee_agreements WHERE client_id = _client_id OR process_id = ANY(_process_ids)), 0),
    'expenses',           COALESCE((SELECT count(*) FROM public.expenses WHERE client_id = _client_id OR process_id = ANY(_process_ids)), 0),
    'invoices',           COALESCE((SELECT count(*) FROM public.invoices WHERE client_id = _client_id), 0),
    'signature_requests', COALESCE((SELECT count(*) FROM public.signature_requests WHERE client_id = _client_id), 0),
    'portal_tokens',      COALESCE((SELECT count(*) FROM public.client_portal_tokens WHERE client_id = _client_id), 0)
  );

  -- AUDIT LOG ANTES da exclusão (para forensics)
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    _caller,
    'PURGE_CLIENT',
    'clients',
    _client_id,
    to_jsonb(_client_row),
    jsonb_build_object('cascade_counts', _counts, 'process_ids', _process_ids)
  );

  -- Cascade explícito (ordem: filhos -> pai)
  IF _process_ids IS NOT NULL AND array_length(_process_ids, 1) > 0 THEN
    DELETE FROM public.intimations WHERE process_id = ANY(_process_ids);
    DELETE FROM public.tasks       WHERE process_id = ANY(_process_ids);
    DELETE FROM public.documents   WHERE process_id = ANY(_process_ids);
    DELETE FROM public.fee_agreements WHERE process_id = ANY(_process_ids);
    DELETE FROM public.expenses    WHERE process_id = ANY(_process_ids);
  END IF;
  DELETE FROM public.documents          WHERE client_id = _client_id;
  DELETE FROM public.fee_agreements     WHERE client_id = _client_id;
  DELETE FROM public.expenses           WHERE client_id = _client_id;
  DELETE FROM public.invoices           WHERE client_id = _client_id;
  DELETE FROM public.signature_requests WHERE client_id = _client_id;
  DELETE FROM public.client_portal_tokens WHERE client_id = _client_id;
  DELETE FROM public.processes WHERE client_id = _client_id;
  DELETE FROM public.clients WHERE id = _client_id;

  RETURN jsonb_build_object('ok', true, 'client_id', _client_id, 'cascade_counts', _counts);
END;
$$;

-- Apenas authenticated pode invocar (a checagem real é dentro da função via has_role).
REVOKE ALL ON FUNCTION public.purge_client(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.purge_client(uuid) TO authenticated;