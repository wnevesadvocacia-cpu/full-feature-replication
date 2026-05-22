CREATE OR REPLACE FUNCTION public.notify_task_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _assignee_user_id uuid;
  _assignee_email text;
  _due text;
  _html text;
  _subject text;
  _msg_id text;
BEGIN
  IF NEW.assignee IS NULL OR btrim(NEW.assignee) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.assignee,'') = COALESCE(NEW.assignee,'') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT id, email INTO _assignee_user_id, _assignee_email
    FROM auth.users WHERE id = NEW.assignee::uuid LIMIT 1;
  EXCEPTION WHEN others THEN
    _assignee_user_id := NULL;
  END;

  IF _assignee_user_id IS NULL THEN
    SELECT id, email INTO _assignee_user_id, _assignee_email
    FROM auth.users WHERE lower(email) = lower(NEW.assignee) LIMIT 1;
  END IF;

  IF _assignee_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  _due := COALESCE(to_char(NEW.due_date, 'DD/MM/YYYY'), 'sem prazo definido');

  INSERT INTO public.notifications(user_id, title, message, type, link)
  VALUES (
    _assignee_user_id,
    'Nova tarefa atribuída',
    NEW.title || ' — prazo: ' || _due,
    'info',
    '/tarefas'
  );

  IF _assignee_email IS NOT NULL THEN
    _subject := 'WnevesBox — Nova tarefa atribuída';
    _msg_id := gen_random_uuid()::text;
    _html :=
      '<div style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#222">' ||
      '<h2 style="margin:0 0 12px">Nova tarefa atribuída a você</h2>' ||
      '<p style="margin:0 0 8px"><strong>Título:</strong> ' || coalesce(NEW.title,'') || '</p>' ||
      '<p style="margin:0 0 8px"><strong>Prazo:</strong> ' || _due || '</p>' ||
      '<p style="margin:0 0 8px"><strong>Prioridade:</strong> ' || coalesce(NEW.priority,'-') || '</p>' ||
      CASE WHEN NEW.description IS NOT NULL AND btrim(NEW.description) <> ''
           THEN '<p style="margin:12px 0 0"><strong>Descrição:</strong><br>' || replace(NEW.description, E'\n', '<br>') || '</p>'
           ELSE '' END ||
      '<p style="margin:20px 0 0"><a href="https://wnevesbox.com/tarefas" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir no WnevesBox</a></p>' ||
      '</div>';

    PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
      'queued_at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'to', _assignee_email,
      'sender_domain', 'notify.wnevesbox.com',
      'from', 'WnevesBox <notify@notify.wnevesbox.com>',
      'subject', _subject,
      'html', _html,
      'purpose', 'transactional',
      'label', 'task_assigned',
      'idempotency_key', 'task-assigned-' || NEW.id::text || '-' || _assignee_user_id::text,
      'message_id', _msg_id
    ));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assignee_ins ON public.tasks;
DROP TRIGGER IF EXISTS trg_notify_task_assignee_upd ON public.tasks;

CREATE TRIGGER trg_notify_task_assignee_ins
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignee();

CREATE TRIGGER trg_notify_task_assignee_upd
AFTER UPDATE OF assignee ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignee();