CREATE OR REPLACE FUNCTION public.notify_task_cc(
  _cc_user_id uuid,
  _title text,
  _assignee text,
  _due_date date DEFAULT NULL,
  _process_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cc_email text;
  _creator_email text;
  _due text := COALESCE(to_char(_due_date, 'DD/MM/YYYY'), 'sem prazo definido');
  _html text; _text text; _msg_id text := gen_random_uuid()::text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _cc_user_id IS NULL THEN RAISE EXCEPTION 'cc_user_id obrigatório'; END IF;

  SELECT email INTO _cc_email FROM auth.users WHERE id = _cc_user_id;
  SELECT email INTO _creator_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.notifications(user_id, title, message, type, link)
  VALUES (
    _cc_user_id,
    '📋 Cópia de nova tarefa',
    COALESCE(_creator_email,'Usuário') || ' criou a tarefa "' || COALESCE(_title,'') || '" para ' || COALESCE(_assignee,'') || ' — prazo: ' || _due,
    'info',
    '/tarefas'
  );

  IF _cc_email IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'email', false);
  END IF;

  _html :=
    '<div style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#222">' ||
    '<h2 style="margin:0 0 12px">Cópia de nova tarefa cadastrada</h2>' ||
    '<p style="margin:0 0 8px"><strong>Título:</strong> ' || COALESCE(_title,'') || '</p>' ||
    '<p style="margin:0 0 8px"><strong>Responsável:</strong> ' || COALESCE(_assignee,'') || '</p>' ||
    '<p style="margin:0 0 8px"><strong>Prazo:</strong> ' || _due || '</p>' ||
    CASE WHEN _process_number IS NOT NULL AND btrim(_process_number) <> ''
         THEN '<p style="margin:0 0 8px"><strong>Processo:</strong> ' || _process_number || '</p>' ELSE '' END ||
    '<p style="margin:0 0 8px"><strong>Cadastrada por:</strong> ' || COALESCE(_creator_email,'-') || '</p>' ||
    '<p style="margin:20px 0 0"><a href="https://wnevesbox.com/tarefas" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir no WnevesBox</a></p>' ||
    '</div>';

  _text :=
    'Cópia de nova tarefa cadastrada' || E'\n\n' ||
    'Título: ' || COALESCE(_title,'') || E'\n' ||
    'Responsável: ' || COALESCE(_assignee,'') || E'\n' ||
    'Prazo: ' || _due || E'\n' ||
    COALESCE('Processo: ' || NULLIF(btrim(COALESCE(_process_number,'')),'') || E'\n', '') ||
    'Cadastrada por: ' || COALESCE(_creator_email,'-') || E'\n\n' ||
    'Abra no WnevesBox: https://wnevesbox.com/tarefas';

  PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
    'queued_at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'to', _cc_email,
    'sender_domain', 'notify.wnevesbox.com',
    'from', 'WnevesBox <notify@notify.wnevesbox.com>',
    'subject', 'WnevesBox — Cópia de nova tarefa',
    'html', _html,
    'text', _text,
    'purpose', 'transactional',
    'label', 'task_cc',
    'idempotency_key', 'task-cc-' || _msg_id,
    'message_id', _msg_id
  ));

  RETURN jsonb_build_object('ok', true, 'email', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_task_cc(uuid, text, text, date, text) TO authenticated;