-- 1) Trigger: e-mail quando tarefa é criada / responsável alterado
DROP TRIGGER IF EXISTS trg_notify_task_assignee ON public.tasks;
CREATE TRIGGER trg_notify_task_assignee
AFTER INSERT OR UPDATE OF assignee ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.notify_task_assignee();

-- 2) Função: alerta de vencimento em 5 dias (corre 1x/dia)
CREATE OR REPLACE FUNCTION public.notify_tasks_due_soon(_days_ahead integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _target_date date := CURRENT_DATE + _days_ahead;
  _count integer := 0;
  _rec record;
  _assignee_user_id uuid;
  _assignee_email text;
  _due text;
  _subject text;
  _html text;
  _text text;
  _msg_id text;
BEGIN
  FOR _rec IN
    SELECT id, user_id, title, description, priority, due_date, assignee
    FROM public.tasks
    WHERE completed = false
      AND due_date = _target_date
      AND assignee IS NOT NULL
      AND btrim(assignee) <> ''
  LOOP
    _assignee_user_id := NULL;
    _assignee_email := NULL;

    BEGIN
      SELECT id, email INTO _assignee_user_id, _assignee_email
      FROM auth.users WHERE id = _rec.assignee::uuid LIMIT 1;
    EXCEPTION WHEN others THEN
      _assignee_user_id := NULL;
    END;

    IF _assignee_user_id IS NULL THEN
      SELECT id, email INTO _assignee_user_id, _assignee_email
      FROM auth.users WHERE lower(email) = lower(_rec.assignee) LIMIT 1;
    END IF;

    IF _assignee_email IS NULL THEN CONTINUE; END IF;

    _due := to_char(_rec.due_date, 'DD/MM/YYYY');
    _subject := 'WnevesBox — Tarefa vence em ' || _days_ahead || ' dias';
    _msg_id := gen_random_uuid()::text;

    _html :=
      '<div style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#222">' ||
      '<h2 style="margin:0 0 12px">⏰ Tarefa vence em ' || _days_ahead || ' dias</h2>' ||
      '<p style="margin:0 0 8px"><strong>Título:</strong> ' || coalesce(_rec.title,'') || '</p>' ||
      '<p style="margin:0 0 8px"><strong>Prazo:</strong> ' || _due || '</p>' ||
      '<p style="margin:0 0 8px"><strong>Prioridade:</strong> ' || coalesce(_rec.priority,'-') || '</p>' ||
      CASE WHEN _rec.description IS NOT NULL AND btrim(_rec.description) <> ''
           THEN '<p style="margin:12px 0 0"><strong>Descrição:</strong><br>' || replace(_rec.description, E'\n', '<br>') || '</p>'
           ELSE '' END ||
      '<p style="margin:20px 0 0"><a href="https://wnevesbox.com/tarefas" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir no WnevesBox</a></p>' ||
      '</div>';

    _text :=
      'Tarefa vence em ' || _days_ahead || ' dias' || E'\n\n' ||
      'Título: ' || coalesce(_rec.title,'') || E'\n' ||
      'Prazo: ' || _due || E'\n' ||
      'Prioridade: ' || coalesce(_rec.priority,'-') || E'\n' ||
      E'\nAbra no WnevesBox: https://wnevesbox.com/tarefas';

    INSERT INTO public.notifications(user_id, title, message, type, link)
    VALUES (
      _assignee_user_id,
      '⏰ Tarefa vence em ' || _days_ahead || ' dias',
      coalesce(_rec.title,'') || ' — prazo: ' || _due,
      'warning',
      '/tarefas'
    );

    PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
      'queued_at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'to', _assignee_email,
      'sender_domain', 'notify.wnevesbox.com',
      'from', 'WnevesBox <notify@notify.wnevesbox.com>',
      'subject', _subject,
      'html', _html,
      'text', _text,
      'purpose', 'transactional',
      'label', 'task_due_soon',
      'idempotency_key', 'task-due-soon-' || _rec.id::text || '-' || to_char(CURRENT_DATE,'YYYYMMDD'),
      'message_id', _msg_id
    ));

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- 3) Cron diário (12:00 UTC = 09:00 BRT)
SELECT cron.unschedule('notify_tasks_due_soon_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='notify_tasks_due_soon_daily');

SELECT cron.schedule(
  'notify_tasks_due_soon_daily',
  '0 12 * * *',
  $$ SELECT public.notify_tasks_due_soon(5); $$
);