import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, ShieldAlert } from 'lucide-react';

type AppRole = 'admin' | 'advogado' | 'estagiario' | 'financeiro';
const ROLES: AppRole[] = ['admin', 'advogado', 'estagiario', 'financeiro'];

const roleLabel: Record<AppRole, string> = {
  admin: 'Admin', advogado: 'Advogado',
  estagiario: 'Estagiário', financeiro: 'Financeiro',
};

export default function Equipe() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<AppRole>('advogado');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['user-roles-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const grant = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Informe o user_id');
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-roles-all'] });
      setUserId('');
      toast({ title: 'Papel atribuído!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-roles-all'] });
      toast({ title: 'Papel removido.' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-md mx-auto mt-12 text-center space-y-3">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-semibold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem gerenciar a equipe.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold">Equipe</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Atribua papéis aos usuários do escritório.
        </p>
      </div>

      <div className="bg-card rounded-lg shadow-card p-4 space-y-3">
        <h2 className="font-semibold text-sm">Atribuir papel</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label>User ID (UUID)</Label>
            <Input
              className="mt-1 font-mono text-xs"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <div>
            <Label>Papel</Label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm h-10"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
            >
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select>
          </div>
        </div>
        <Button onClick={() => grant.mutate()} disabled={!userId || grant.isPending}>
          {grant.isPending ? 'Salvando…' : 'Atribuir'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Dica: o user_id pode ser obtido na tela de autenticação do backend.
        </p>
      </div>

      <div className="bg-card rounded-lg shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Papéis atribuídos</h2>
        </div>
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">Nenhum papel atribuído.</p>
        ) : (
          <div className="divide-y">
            {rows.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono truncate text-muted-foreground">{r.user_id}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(r.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <Badge variant="outline">{roleLabel[r.role as AppRole]}</Badge>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-red-500"
                  onClick={() => revoke.mutate(r.id)}
                  disabled={revoke.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
