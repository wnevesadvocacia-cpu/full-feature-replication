CREATE OR REPLACE FUNCTION public.notify_task_assignee() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipient uuid;
BEGIN
 IF NEW.assignee IS NULL OR btrim(NEW.assignee) = '' THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' AND OLD.assignee IS NOT DISTINCT FROM NEW.assignee THEN RETURN NEW; END IF;
 SELECT id INTO recipient FROM auth.users WHERE id::text = NEW.assignee OR lower(email) = lower(btrim(NEW.assignee)) LIMIT 1;
 IF recipient IS NOT NULL THEN
 INSERT INTO public.notifications(user_id,title,message,type,link) VALUES (recipient,'Nova tarefa atribuída',NEW.title || ' — prazo: ' || COALESCE(to_char(NEW.due_date,'DD/MM/YYYY'),'sem prazo definido'),'info','/tarefas');
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.notify_task_cc(_cc_user_id uuid, _title text, _assignee text, _due_date date DEFAULT NULL, _process_number text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 IF NOT public.can_delete(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT public.can_delete(_cc_user_id) THEN RAISE EXCEPTION 'Gestor inválido'; END IF;
 INSERT INTO public.notifications(user_id,title,message,type,link) VALUES (_cc_user_id,'📋 Cópia de prazo',COALESCE(public.current_user_email(),'Usuário') || ' cadastrou ou atualizou o prazo "' || COALESCE(_title,'') || '" para ' || COALESCE(_assignee,'') || ' — prazo: ' || COALESCE(to_char(_due_date,'DD/MM/YYYY'),'sem prazo definido'),'info','/tarefas');
 RETURN jsonb_build_object('ok',true,'email',false);
END; $$;
REVOKE ALL ON FUNCTION public.notify_task_cc(uuid,text,text,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notify_task_cc(uuid,text,text,date,text) TO authenticated,service_role;
COMMENT ON FUNCTION public.notify_task_assignee() IS 'In-app assignment notification; managed app emails are sent by task-notification after successful persistence.';
COMMENT ON FUNCTION public.notify_task_cc(uuid,text,text,date,text) IS 'Authorized in-app supervisor copy; managed email is sent by task-notification.';