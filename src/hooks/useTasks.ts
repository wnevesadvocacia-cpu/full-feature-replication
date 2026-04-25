import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useTasks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, processes(number)')
        .not('assignee', 'eq', 'movimentacao')
        .not('assignee', 'eq', 'documento')
        .not('assignee', 'eq', 'agenda')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 60_000, // Sprint1.7: poll de segurança 60s
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (task: { title: string; description?: string; process_id?: string; assignee?: string; priority?: string; due_date?: string }) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({ ...task, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; completed?: boolean; status?: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
