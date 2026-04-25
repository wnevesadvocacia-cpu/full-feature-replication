import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { clientCreateSchema, clientImportSchema, stripServerOnly } from '@/lib/validationSchemas';

export function useClients() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false }).limit(5000);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (client: { name: string; email?: string; phone?: string; type: string; document?: string }) => {
      // S28: valida + bloqueia campos server-only antes do insert
      const parsed = clientCreateSchema.parse(stripServerOnly(client as any));
      const { data, error } = await supabase
        .from('clients')
        .insert({ ...parsed, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function useImportClients() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (clients: { name: string; email?: string; phone?: string; type?: string; document?: string }[]) => {
      // S28: valida cada linha; rejeita o lote inteiro se alguma falhar
      const rows = clients.map(c => {
        const parsed = clientImportSchema.parse(stripServerOnly(c as any));
        return { ...parsed, type: parsed.type || 'PF', user_id: user!.id };
      });
      const { data, error } = await supabase
        .from('clients')
        .insert(rows)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}
