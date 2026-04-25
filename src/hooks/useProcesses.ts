import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { processCreateSchema, processUpdateSchema, stripServerOnly } from '@/lib/validationSchemas';

export const PROCESSES_PAGE_SIZE = 50;

export function useProcesses(page: number = 0, pageSize: number = PROCESSES_PAGE_SIZE) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['processes', page, pageSize],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from('processes')
        .select('*, clients(name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    enabled: !!user,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000, // Sprint1.7: poll de segurança 60s
  });
}

export function useCreateProcess() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (process: { number: string; title: string; type?: string; status?: string; due_date?: string; lawyer?: string; value?: number; client_id?: string }) => {
      // S28: valida + bloqueia campos server-only
      const parsed = processCreateSchema.parse(stripServerOnly(process as any));
      const { data, error } = await supabase
        .from('processes')
        .insert({ ...parsed, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  });
}

export function useUpdateProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; title?: string; [key: string]: any }) => {
      // S28: valida payload (passthrough p/ campos legítimos extras) + remove server-only
      const parsed = processUpdateSchema.parse(stripServerOnly({ id, ...updates }));
      const { id: _id, ...rest } = parsed;
      const { data, error } = await supabase
        .from('processes')
        .update(rest as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  });
}
