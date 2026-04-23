import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Trash2, CheckSquare, Bell, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Intim { id: string; court: string | null; content: string; deadline: string | null; status: string; received_at: string; process_id: string | null; }

export default function Intimacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'todas' | 'pendente' | 'tratada'>('pendente');
  const [form, setForm] = useState({ court: '', content: '', deadline: '' });
  const [syncing, setSyncing] = useState(false);

  const syncDjen = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-djen', { body: {}, method: 'POST' });
      if (error) throw error;
      const r = (data?.results || [])[0];
      if (!r) toast({ title: 'Cadastre sua OAB em Configurações → Intimações', variant: 'destructive' });
      else toast({ title: 'Sincronizado', description: `${r.inserted} novas / ${r.total} encontradas` });
      qc.invalidateQueries({ queryKey: ['intimations'] });
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSyncing(false); }
  };

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['intimations'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('intimations').select('*').order('received_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data as Intim[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('intimations').insert({
        user_id: user!.id, court: form.court || null, content: form.content,
        deadline: form.deadline || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['intimations'] }); setOpen(false); setForm({ court: '', content: '', deadline: '' }); toast({ title: 'Intimação registrada' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from('intimations').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['intimations'] }); toast({ title: 'Excluída' }); },
  });

  const markDone = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from('intimations').update({ status: 'tratada' }).eq('id', id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intimations'] }),
  });

  const toTask = useMutation({
    mutationFn: async (it: Intim) => {
      const { error } = await supabase.from('tasks').insert({
        user_id: user!.id,
        title: `Intimação: ${it.content.slice(0, 60)}`,
        description: it.content,
        due_date: it.deadline,
        priority: 'alta',
        process_id: it.process_id,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast({ title: 'Tarefa criada' }); },
  });

  const filtered = items.filter((i) => filter === 'todas' || i.status === filter);

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Intimações</h1>
          <p className="text-muted-foreground text-sm mt-1">Sincronização automática via DJEN/CNJ a cada 6h</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={syncDjen} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sincronizar
          </Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova Intimação</Button>
        </div>
      </div>

      <div className="flex gap-1">
        {(['pendente', 'todas', 'tratada'] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
            {f === 'pendente' ? 'Pendentes' : f === 'tratada' ? 'Tratadas' : 'Todas'}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>Nenhuma intimação.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((it) => (
            <div key={it.id} className="bg-card rounded-lg p-4 border shadow-card hover:shadow-card-hover flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {it.court && <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{it.court}</span>}
                  <Badge variant={it.status === 'tratada' ? 'outline' : 'default'} className="text-xs">{it.status}</Badge>
                  {it.deadline && <span className="text-xs text-warning">Prazo: {new Date(it.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                </div>
                <p className="text-sm mt-2">{it.content}</p>
                <p className="text-xs text-muted-foreground mt-1">Recebida em {new Date(it.received_at + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => toTask.mutate(it)}>
                  <CheckSquare className="h-3 w-3 mr-1" /> Criar Tarefa
                </Button>
                {it.status !== 'tratada' && (
                  <Button size="sm" variant="ghost" onClick={() => markDone.mutate(it.id)}>Marcar tratada</Button>
                )}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate(it.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Intimação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Tribunal/Vara</Label><Input value={form.court} onChange={(e) => setForm({ ...form, court: e.target.value })} placeholder="Ex: 2ª Vara Cível - TJSP" /></div>
            <div><Label>Conteúdo *</Label><Textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
            <div><Label>Prazo</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.content || create.isPending}>
              {create.isPending ? 'Salvando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
