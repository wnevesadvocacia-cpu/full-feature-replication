import { sendLoggedEmail } from './send-logged-email.ts'

Deno.test('successful, suppressed and failed sends preserve concrete audit outcomes', async () => {
  for (const outcome of ['sent', 'suppressed', 'failed'] as const) {
    const rows: Record<string, unknown>[] = []
    const write = async (row: Record<string, unknown>) => { rows.push(row); return { error: null } }
    const send = async () => {
      if (outcome === 'failed') throw new Error('transport failure')
      return outcome === 'sent' ? { sent: true as const } : { sent: false as const, reason: 'recipient_suppressed' as const }
    }
    try { await sendLoggedEmail(write, 'lockout_notice', 'user@example.test', { idempotencyKey: 'event-1' }, send) } catch { if (outcome !== 'failed') throw new Error('Unexpected failure') }
    if (rows.length !== 1 || rows[0].status !== outcome || rows[0].message_id !== 'event-1') throw new Error('Incorrect audit outcome')
  }
})

Deno.test('audit failure does not turn an accepted email into a failed send', async () => {
  const result = await sendLoggedEmail(async () => ({ error: { message: 'audit unavailable' } }), 'lockout_notice', 'user@example.test', {}, async () => ({ sent: true }))
  if (!result.sent) throw new Error('Accepted email was changed by audit failure')
})