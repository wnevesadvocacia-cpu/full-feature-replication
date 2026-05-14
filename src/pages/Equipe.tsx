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
import { Loader2, Trash2, ShieldAlert, UserPlus, Eye, EyeOff } from 'lucide-react';

type AppRole = 'admin' | 'gerente' | 'advogado' | 'estagiario' | 'financeiro' | 'usuario' | 'assistente_adm';
const ROLES: AppRole[] = ['admin', 'gerente', 'advogado', 'estagiario', 'financeiro', 'assistente_adm', 'usuario'];

const roleLabel: Record<AppRole, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  advogado: 'Advogado',
  estagiario: 'Estagiário',
  financeiro: 'Financeiro',
  assistente_adm: 'Assistente Administrativo',
  usuario: 'Usuário',
};

export default function Equipe() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<AppRole>('advogado');

  // Criar novo usuário
  const [newEmail, setNewEmail] = useState('');
  const [newEmailConfirm, setNewEmailConfirm] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('advogado');
  const [showPass, setShowPass] = useState(false);
  const [showPassConfirm, setShowPassConfirm] = useState(false);

  const emailMatches = newEmail.length > 0 && newEmail === newEmailConfirm;
  const passMatches = newPass.length >= 12 && newPass === newPassConfirm;
  const emailMismatch = newEmailConfirm.length > 0 && newEmail !== newEmailConfirm;
  const passMismatch = newPassConfirm.length > 0 && newPass !== newPassConfirm;

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

  const createUser = useMutation({
    mutationFn: async () => {
      if (newEmail !== newEmailConfirm) throw new Error('Os e-mails não conferem.');
      if (newPass !== newPassConfirm) throw new Error('As senhas não conferem.');
      if (newPass.length < 12) throw new Error('A senha precisa ter no mínimo 12 caracteres.');
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email: newEmail, password: newPass, role: newRole },
      });
      // supabase-js wraps non-2xx em FunctionsHttpError; tenta extrair mensagem do body.
      if (error) {
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
          }
        } catch {}
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-roles-all'] });
      const created = newEmail;
      setNewEmail(''); setNewEmailConfirm(''); setNewPass(''); setNewPassConfirm('');
      toast({ title: 'Usuário criado!', description: `${created} já pode entrar no sistema.` });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar usuário', description: e.message, variant: 'destructive' }),
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

      {/* Criar novo usuário */}
      <div className="bg-card rounded-lg shadow-card p-4 space-y-3 border-2 border-primary/20">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Criar novo usuário
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Email</Label>
            <Input
              className="mt-1" type="email" placeholder="usuario@dominio.com" autoComplete="off"
              value={newEmail} onChange={(e) => setNewEmail(e.target.value.trim())}
            />
          </div>
          <div>
            <Label>Confirmar email</Label>
            <Input
              className="mt-1" type="email" placeholder="repita o e-mail" autoComplete="off"
              value={newEmailConfirm} onChange={(e) => setNewEmailConfirm(e.target.value.trim())}
              aria-invalid={emailMismatch}
            />
            {emailMismatch && (
              <p className="text-xs text-destructive mt-1">Os e-mails não conferem.</p>
            )}
          </div>
          <div>
            <Label>Senha (mín. 12 caracteres)</Label>
            <div className="relative mt-1">
              <Input
                type={showPass ? 'text' : 'password'} placeholder="••••••••••••" autoComplete="new-password"
                value={newPass} onChange={(e) => setNewPass(e.target.value)}
                className="pr-10"
              />
              <button
                type="button" onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPass.length > 0 && newPass.length < 12 && (
              <p className="text-xs text-destructive mt-1">Faltam {12 - newPass.length} caracteres.</p>
            )}
          </div>
          <div>
            <Label>Confirmar senha</Label>
            <div className="relative mt-1">
              <Input
                type={showPassConfirm ? 'text' : 'password'} placeholder="repita a senha" autoComplete="new-password"
                value={newPassConfirm} onChange={(e) => setNewPassConfirm(e.target.value)}
                className="pr-10"
                aria-invalid={passMismatch}
              />
              <button
                type="button" onClick={() => setShowPassConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassConfirm ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passMismatch && (
              <p className="text-xs text-destructive mt-1">As senhas não conferem.</p>
            )}
          </div>
          <div className="md:col-span-2">
            <Label>Papel</Label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm h-10"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AppRole)}
            >
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select>
          </div>
        </div>
        <Button
          onClick={() => createUser.mutate()}
          disabled={!emailMatches || !passMatches || createUser.isPending}
        >
          {createUser.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando…</> : <><UserPlus className="h-4 w-4 mr-2" />Criar usuário</>}
        </Button>
        <p className="text-xs text-muted-foreground">
          O usuário é criado já confirmado e pode fazer login imediatamente.
        </p>
      </div>

      <div className="bg-card rounded-lg shadow-card p-4 space-y-3">
        <h2 className="font-semibold text-sm">Atribuir papel a usuário existente</h2>
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
