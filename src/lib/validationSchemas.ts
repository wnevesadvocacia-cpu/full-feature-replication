// S28: schemas Zod para validar payloads de mutações no client.
// Bloqueia campos server-only (user_id, role, created_by) — qualquer
// tentativa de injeção é rejeitada antes de tocar o Supabase.
import { z } from 'zod';

// Campos NUNCA aceitos do client (preenchidos no servidor/RLS)
const SERVER_ONLY = ['user_id', 'created_by', 'role', 'created_at', 'updated_at'] as const;

/** Helper: remove campos server-only de qualquer objeto antes do insert/update. */
export function stripServerOnly<T extends Record<string, any>>(obj: T): Omit<T, typeof SERVER_ONLY[number]> {
  const clean = { ...obj };
  for (const key of SERVER_ONLY) delete clean[key];
  return clean;
}

// ────────────── CLIENTS ──────────────
export const clientCreateSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(200),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  type: z.enum(['PF', 'PJ']),
  document: z.string().trim().max(20).optional().or(z.literal('')),
}).strict();

export const clientImportSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  type: z.enum(['PF', 'PJ']).optional(),
  document: z.string().trim().max(20).optional().or(z.literal('')),
}).strict();

// ────────────── PROCESSES ──────────────
export const processCreateSchema = z.object({
  number: z.string().trim().min(1, 'Número obrigatório').max(50),
  title: z.string().trim().min(1, 'Título obrigatório').max(300),
  type: z.string().trim().max(80).optional(),
  status: z.string().trim().max(40).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').optional(),
  lawyer: z.string().trim().max(120).optional(),
  value: z.number().nonnegative().max(1e12).optional(),
  client_id: z.string().uuid().optional(),
}).strict();

export const processUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  number: z.string().trim().min(1).max(50).optional(),
  type: z.string().trim().max(80).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  lawyer: z.string().trim().max(120).optional(),
  value: z.number().nonnegative().max(1e12).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  responsible: z.string().trim().max(120).optional(),
  phase: z.string().trim().max(80).optional(),
  stage: z.string().trim().max(80).optional(),
  observations: z.string().max(5000).optional(),
}).strict().passthrough(); // permite extras conhecidos sem ser exigente

// ────────────── TASKS ──────────────
export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, 'Título obrigatório').max(300),
  description: z.string().max(5000).optional(),
  process_id: z.string().uuid().optional(),
  assignee: z.string().trim().max(255).optional(),
  priority: z.enum(['baixa', 'media', 'alta', 'urgente']).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

export const taskUpdateSchema = z.object({
  id: z.string().uuid(),
  completed: z.boolean().optional(),
  status: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  priority: z.enum(['baixa', 'media', 'alta', 'urgente']).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assignee: z.string().trim().max(255).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict().passthrough();
