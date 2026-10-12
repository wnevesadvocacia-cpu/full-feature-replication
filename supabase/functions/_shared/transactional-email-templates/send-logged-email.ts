import { sendTemplateEmail, type SendTemplateEmailOptions } from './send-email.ts'

// Audit writes are observational; their failure must not change the send result.
export async function sendLoggedEmail(
  writeLog: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message: string } | null }>,
  templateName: string,
  recipient: string,
  options: SendTemplateEmailOptions,
  send = sendTemplateEmail,
) {
  const log = async (status: string, errorMessage?: string) => {
    try {
      const { error } = await writeLog({ message_id: options.idempotencyKey ?? null, template_name: templateName, recipient_email: recipient, status, error_message: errorMessage ?? null })
      if (error) console.error('Email audit write failed', { code: error.code })
    } catch { console.error('Email audit write failed') }
  }
  try {
    const result = await send(templateName, recipient, options)
    await log(result.sent ? 'sent' : 'suppressed')
    return result
  } catch (error) {
    await log('failed', error instanceof Error ? error.message.slice(0, 1000) : 'Email send failed')
    throw error
  }
}