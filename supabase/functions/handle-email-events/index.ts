import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.3.1'
import { createClient } from 'npm:@supabase/supabase-js@2'

async function recordOutcome(event: { event_id: string; data: { recipient: string } }, reason: 'bounce' | 'complaint' | 'unsubscribe', status: string) {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Email events configuration missing')
  const client = createClient(url, key)
  const email = event.data.recipient.toLowerCase()
  const { error: suppressionError } = await client.from('suppressed_emails').upsert({ email, reason, metadata: null }, { onConflict: 'email' })
  if (suppressionError) throw new Error(`Email outcome write failed: ${suppressionError.code}`)
  const { data: existing, error: readError } = await client.from('email_send_log').select('id').eq('message_id', event.event_id).eq('status', status).limit(1)
  if (readError) throw new Error(`Email outcome read failed: ${readError.code}`)
  if (existing?.length) return
  const { error } = await client.from('email_send_log').insert({ message_id: event.event_id, template_name: 'system', recipient_email: email, status, error_message: `Email ${reason}`, metadata: null })
  if (error) throw new Error(`Email outcome log failed: ${error.code}`)
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    // Placeholder handlers — replace each log with the feature's reaction.
    // Throw on failure so the delivery is retried.
    'email.bounced': async (event) => {
      await recordOutcome(event, 'bounce', 'bounced')
    },
    'email.complaint': async (event) => {
      await recordOutcome(event, 'complaint', 'complained')
    },
    'email.unsubscribed': async (event) => {
      await recordOutcome(event, 'unsubscribe', 'suppressed')
    },
  },
})

Deno.serve((req) => handler(req))
