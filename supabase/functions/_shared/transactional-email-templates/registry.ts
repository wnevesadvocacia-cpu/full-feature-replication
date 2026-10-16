import type { ComponentType } from 'npm:react@18.3.1'
import { template as lockoutNotice } from './lockout-notice.tsx'
import { template as prazoCritico } from './prazo-critico-djen.tsx'
import { template as taskUpdate } from './task-update.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome.tsx'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'task-update': taskUpdate,
  'lockout_notice': lockoutNotice,
  'prazo-critico-djen': prazoCritico,
}
