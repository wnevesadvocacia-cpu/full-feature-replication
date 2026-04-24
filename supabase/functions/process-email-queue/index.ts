import { sendLovableEmail } from 'npm:@lovable.dev/email-js'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

interface QueuePayload {
  run_id?: string
  message_id?: string
  to?: string
  from?: string
  sender_domain?: string
  subject?: string
  html?: string
  text?: string
  purpose?: string
  label?: string
  idempotency_key?: string
  unsubscribe_token?: string
  queued_at?: string
}

interface QueueMessage {
  msg_id: number
  read_ct?: number
  enqueued_at?: string
  message: QueuePayload
}

interface EmailStateRow {
  retry_after_until?: string | null
  batch_size?: number | null
  send_delay_ms?: number | null
  auth_email_ttl_minutes?: number | null
  transactional_email_ttl_minutes?: number | null
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

function isForbidden(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 403
  }
  return error instanceof Error && error.message.includes('403')
}

function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

async function insertLog(
  supabase: any,
  entry: {
    message_id?: string
    template_name: string
    recipient_email?: string
    status: string
    error_message?: string
  }
) {
  const payload = {
    message_id: entry.message_id ?? crypto.randomUUID(),
    template_name: entry.template_name,
    recipient_email: entry.recipient_email ?? 'unknown@local',
    status: entry.status,
    error_message: entry.error_message,
  }

  const { error } = await supabase.from('email_send_log').insert(payload)
  if (error) {
    console.error('Failed to insert email log', { payload, error })
  }
}

async function moveToDlq(
  supabase: any,
  queue: string,
  msg: QueueMessage,
  reason: string
): Promise<void> {
  const payload = msg.message

  await insertLog(supabase, {
    message_id: payload.message_id,
    template_name: payload.label || queue,
    recipient_email: payload.to,
    status: 'dlq',
    error_message: reason,
  })

  const { error } = await supabase.rpc('move_to_dlq', {
    source_queue: queue,
    dlq_name: `${queue}_dlq`,
    message_id: msg.msg_id,
    payload,
  })

  if (error) {
    console.error('Failed to move message to DLQ', {
      queue,
      msg_id: msg.msg_id,
      reason,
      error,
    })
  }
}

Deno.serve(async (req) => {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice('Bearer '.length).trim()
  const claims = parseJwtClaims(token)
  if (claims?.role !== 'service_role') {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const supabase: any = createClient(supabaseUrl, supabaseServiceKey)

  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  const emailState = (state ?? {}) as EmailStateRow

  if (emailState.retry_after_until && new Date(emailState.retry_after_until) > new Date()) {
    return jsonResponse({ skipped: true, reason: 'rate_limited' })
  }

  const batchSize = emailState.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = emailState.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: emailState.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails:
      emailState.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  for (const queue of ['auth_emails', 'transactional_emails']) {
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error('Failed to read email batch', { queue, error: readError })
      continue
    }

    const queueMessages = (messages ?? []) as QueueMessage[]
    if (!queueMessages.length) continue

    const messageIds = Array.from(
      new Set(
        queueMessages
          .map((msg: QueueMessage) =>
            msg?.message?.message_id && typeof msg.message.message_id === 'string'
              ? msg.message.message_id
              : null
          )
          .filter((id: string | null): id is string => Boolean(id))
      )
    )

    const failedAttemptsByMessageId = new Map<string, number>()

    if (messageIds.length > 0) {
      const { data: failedRows, error: failedRowsError } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      if (failedRowsError) {
        console.error('Failed to load failed-attempt counters', {
          queue,
          error: failedRowsError,
        })
      } else {
        for (const row of failedRows ?? []) {
          const messageId = row?.message_id
          if (typeof messageId !== 'string' || !messageId) continue
          failedAttemptsByMessageId.set(
            messageId,
            (failedAttemptsByMessageId.get(messageId) ?? 0) + 1
          )
        }
      }
    }

    for (let i = 0; i < queueMessages.length; i++) {
      const msg = queueMessages[i]
      const payload = msg.message ?? {}
      const failedAttempts =
        payload.message_id && typeof payload.message_id === 'string'
          ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
          : (msg.read_ct ?? 0)

      const queuedAt = payload.queued_at ?? msg.enqueued_at
      if (queuedAt) {
        const ageMs = Date.now() - new Date(queuedAt).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          console.warn('Email expired (TTL exceeded)', {
            queue,
            msg_id: msg.msg_id,
            queued_at: queuedAt,
            ttl_minutes: ttlMinutes[queue],
          })
          await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`)
          continue
        }
      }

      if (failedAttempts >= MAX_RETRIES) {
        await moveToDlq(
          supabase,
          queue,
          msg,
          `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`
        )
        continue
      }

      if (payload.message_id) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          console.warn('Skipping duplicate send (already sent)', {
            queue,
            msg_id: msg.msg_id,
            message_id: payload.message_id,
          })

          const { error: dupDelError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })

          if (dupDelError) {
            console.error('Failed to delete duplicate message from queue', {
              queue,
              msg_id: msg.msg_id,
              error: dupDelError,
            })
          }
          continue
        }
      }

      try {
        await sendLovableEmail(
          {
            run_id: payload.run_id,
            to: payload.to ?? '',
            from: payload.from ?? '',
            sender_domain: payload.sender_domain ?? '',
            subject: payload.subject ?? 'Notification',
            html: payload.html ?? '',
            text: payload.text ?? '',
            purpose: payload.purpose,
            label: payload.label,
            idempotency_key: payload.idempotency_key,
            unsubscribe_token: payload.unsubscribe_token,
            message_id: payload.message_id,
          },
          { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }
        )

        await insertLog(supabase, {
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'sent',
        })

        const { error: delError } = await supabase.rpc('delete_email', {
          queue_name: queue,
          message_id: msg.msg_id,
        })

        if (delError) {
          console.error('Failed to delete sent message from queue', {
            queue,
            msg_id: msg.msg_id,
            error: delError,
          })
        }

        totalProcessed++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('Email send failed', {
          queue,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          failed_attempts: failedAttempts,
          error: errorMsg,
        })

        if (isRateLimited(error)) {
          await insertLog(supabase, {
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'rate_limited',
            error_message: errorMsg.slice(0, 1000),
          })

          const retryAfterSecs = getRetryAfterSeconds(error)
          await supabase
            .from('email_send_state')
            .update({
              retry_after_until: new Date(Date.now() + retryAfterSecs * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)

          return jsonResponse({ processed: totalProcessed, stopped: 'rate_limited' })
        }

        if (isForbidden(error)) {
          await moveToDlq(supabase, queue, msg, 'Emails disabled for this project')
          return jsonResponse({ processed: totalProcessed, stopped: 'emails_disabled' })
        }

        await insertLog(supabase, {
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'failed',
          error_message: errorMsg.slice(0, 1000),
        })

        if (payload.message_id && typeof payload.message_id === 'string') {
          failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1)
        }
      }

      if (i < queueMessages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, sendDelayMs))
      }
    }
  }

  return jsonResponse({ processed: totalProcessed })
})
