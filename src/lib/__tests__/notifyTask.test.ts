import { beforeEach, describe, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { notifyTask } from '../notifyTask';
describe('notificações após salvar prazo', () => {
  beforeEach(() => invoke.mockReset());
  it('envia somente identificações persistidas, não destinatário livre', async () => {
    invoke.mockResolvedValue({ data: { sent: true }, error: null });
    expect(await notifyTask('task-id', 'manager-id')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('task-notification', { body: { taskId: 'task-id', ccUserId: 'manager-id' } });
  });
  it('falha de e-mail não desfaz salvamento nem confirma envio', async () => {
    invoke.mockRejectedValue(new Error('indisponível'));
    expect(await notifyTask('task-id')).toBe(false);
  });
  it('supressão não é apresentada como envio confirmado', async () => {
    invoke.mockResolvedValue({ data: { sent: false, reason: 'recipient_suppressed' }, error: null });
    expect(await notifyTask('task-id')).toBe(false);
  });
});