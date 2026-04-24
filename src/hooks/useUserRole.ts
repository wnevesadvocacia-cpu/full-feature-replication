import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'admin' | 'gerente' | 'advogado' | 'estagiario' | 'financeiro' | 'usuario' | 'assistente_adm';

export function useUserRoles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
    enabled: !!user,
  });
}

export function useIsAdmin() {
  const { data: roles = [] } = useUserRoles();
  return roles.includes('admin');
}

/** Apenas admin e gerente podem excluir registros do sistema. */
export function useCanDelete() {
  const { data: roles = [] } = useUserRoles();
  return roles.includes('admin') || roles.includes('gerente');
}
