import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, Bell, Check, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

export default function Notificacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('notifications').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => { await (supabase as any).from('notifications').update({ read: true }).eq('id', id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      // Otimização: em vez de update massivo (que pode timeout com centenas de linhas
      // e não retorna confirmação visual), processamos em lotes pelos IDs já em cache.
      const unreadIds = (data as any[]).filter((n) => !n.read).map((n) => n.id);
      if (unreadIds.length === 0) return 0;

      // Lotes de 200 para evitar payloads grandes
      const chunkSize = 200;
      let updated = 0;
      for (let i = 0; i < unreadIds.length; i += chunkSize) {
        const slice = unreadIds.slice(i, i + chunkSize);
        const { data: rows, error } = await (supabase as any)
          .from('notifications')
          .update({ read: true })
          .in('id', slice)
          .eq('user_id', user.id)
          .select('id');
        if (error) throw error;
        updated += rows?.length ?? 0;
      }
      return updated;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      toast({ title: 'Notificações marcadas como lidas', description: `${n} notificação(ões) atualizada(s).` });
    },
    onError: (e: any) => {
      console.error('[markAllRead] erro:', e);
      toast({ title: 'Erro ao marcar como lidas', description: e?.message ?? 'Falha desconhecida', variant: 'destructive' });
    },
  });
  const del = useMutation({
    mutationFn: async (id: string) => { await (supabase as any).from('notifications').delete().eq('id', id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-4 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Notificações</h1>
          <p className="text-muted-foreground text-sm mt-1">{data.filter((n) => !n.read).length} não lidas</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending || data.every((n: any) => n.read)}
        >
          {markAllRead.isPending
            ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Marcando…</>
            : <><Check className="h-4 w-4 mr-1" /> Marcar tudo lido</>}
        </Button>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>Sem notificações</p>
        </div>
      ) : (
        <div className="space-y-1">
          {data.map((n) => (
            <div key={n.id} className={`bg-card rounded-lg p-4 border flex gap-3 ${!n.read ? 'border-primary/40' : ''}`}>
              <div className={`h-2 w-2 mt-2 rounded-full shrink-0 ${!n.read ? 'bg-primary' : 'bg-muted'}`} />
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { markRead.mutate(n.id); if (n.link) nav(n.link); }}>
                <p className="text-sm font-medium">{n.title}</p>
                {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString('pt-BR')}</p>
              </div>
              <Button size="sm" variant="ghost" className="text-destructive shrink-0" onClick={() => del.mutate(n.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
