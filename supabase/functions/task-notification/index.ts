import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendLoggedEmail } from '../_shared/transactional-email-templates/send-logged-email.ts'

Deno.serve(async req => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return respond({ ok: true })
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_ANON_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key || !serviceKey) return respond({ error: 'Configuração indisponível' }, 500)
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } } })
  const { data: auth, error: authError } = await client.auth.getUser()
  if (authError || !auth.user) return respond({ error: 'Unauthorized' }, 401)
  try {
    const { taskId, ccUserId } = await req.json()
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuid.test(taskId || '') || (ccUserId !== undefined && !uuid.test(ccUserId || ''))) return respond({ error: 'Dados inválidos' }, 400)
    const { data: allowed } = await client.rpc('can_delete', { _user_id: auth.user.id })
    if (!allowed) return respond({ error: 'Forbidden' }, 403)
    const { data: task, error } = await client.from('tasks').select('id,title,assignee,due_date,updated_at,processes(number)').eq('id', taskId).single()
    if (error || !task) return respond({ error: 'Prazo não encontrado' }, 404)
    const admin = createClient(url, serviceKey)
    let recipientId: string
    if (ccUserId) {
      const { data: supervisor } = await admin.from('user_roles').select('user_id').eq('user_id', ccUserId).in('role', ['admin', 'gerente']).limit(1).maybeSingle()
      if (!supervisor) return respond({ error: 'Gestor inválido' }, 400)
      const { error: notificationError } = await client.rpc('notify_task_cc', { _cc_user_id: ccUserId, _title: task.title, _assignee: task.assignee, _due_date: task.due_date, _process_number: (task.processes as any)?.number ?? null })
      if (notificationError) throw notificationError
      recipientId = ccUserId
    } else {
      const { data: team, error: teamError } = await client.rpc('list_team_members')
      if (teamError) throw teamError
      const recipient = team?.find((member: any) => member.user_id === task.assignee || member.email?.trim().toLowerCase() === task.assignee?.trim().toLowerCase())
      if (!recipient) return respond({ sent: false, reason: 'responsible_not_found' })
      recipientId = recipient.user_id
    }
    const { data: recipient } = await admin.auth.admin.getUserById(recipientId)
    if (!recipient.user?.email) return respond({ sent: false, reason: 'recipient_not_found' })
    const result = await sendLoggedEmail(row => admin.from('email_send_log').insert(row), 'task-update', recipient.user.email, {
      idempotencyKey: `task-update-${task.id}-${task.updated_at}-${ccUserId ? 'cc' : 'assignee'}-${recipientId}`,
      templateData: { title: task.title, assignee: task.assignee, due: task.due_date?.split('-').reverse().join('/') ?? 'Sem prazo definido', processNumber: (task.processes as any)?.number, copy: !!ccUserId },
    })
    return respond(result)
  } catch {
    return respond({ error: 'Prazo salvo; envio de e-mail não confirmado.' }, 502)
  }
})