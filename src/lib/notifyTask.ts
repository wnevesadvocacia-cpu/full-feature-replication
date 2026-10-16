import { supabase } from '@/integrations/supabase/client';

// Saving remains successful even if managed delivery is unavailable.
export async function notifyTask(taskId: string, ccUserId?: string) {
  try {
    const { data, error } = await supabase.functions.invoke('task-notification', { body: { taskId, ...(ccUserId ? { ccUserId } : {}) } });
    return !error && data?.sent === true;
  } catch { return false; }
}