import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Trash2, CheckSquare, Bell, RefreshCw, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isBusinessDay, previousBusinessDay, nextBusinessDay, formatBR, todayISO } from '@/lib/cnjCalendar';

interface Intim { id: string; court: string | null; content: string; deadline: string | null; status: string; received_at: string; process_id: string | null; }

// Detecta se o conteúdo é HTML (tags ou entidades) e prepara para render seguro.
function renderIntimContent(raw: string) {
  const looksHtml = /<[a-z!/][^>]*>|&[a-z]+;|&#\d+;/i.test(raw);
  if (!looksHtml) return { html: null as string | null, text: raw };
  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p','br','b','strong','i','em','u','span','div','section','article','header','footer','table','thead','tbody','tr','td','th','ul','ol','li','hr','h1','h2','h3','h4','h5','h6','small','sup','sub'],
    ALLOWED_ATTR: ['align','colspan','rowspan'],
  });
  return { html: clean, text: null as string | null };
}


export default function Intimacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'todas' | 'pendente' | 'tratada'>('pendente');
  const [form, setForm] = useState({ court: '', content: '', deadline: '' });
  const [syncing, setSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const t = todayISO();
    return isBusinessDay(t) ? t : previousBusinessDay(t);
  });

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
      const { data, error } = await (supabase as any).from('intimations').select('*').order('received_at', { ascending: false }).limit(2000);
      if (error) throw error;
      return data as Intim[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('intimations').insert({
        user_id: user!.id, court: form.court || null, content: form.content,
        deadline: form.deadline || null, received_at: selectedDate,
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
      // Sanitiza HTML do conteúdo para texto puro antes de salvar
      const plain = it.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const { data, error } = await supabase.from('tasks').insert({
        user_id: user!.id,
        title: `Intimação: ${plain.slice(0, 80)}`,
        description: plain,
        due_date: it.deadline,
        priority: 'alta',
        status: 'pendente',
        process_id: it.process_id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Tarefa criada com sucesso',
        description: 'Acesse o módulo Tarefas para visualizar.',
      });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar tarefa', description: e.message, variant: 'destructive' }),
  });

  // Contagem por dia (para mostrar badges no seletor)
  const countsByDate = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it) => {
      const d = it.received_at?.slice(0, 10);
      if (d) m.set(d, (m.get(d) ?? 0) + 1);
    });
    return m;
  }, [items]);

  const dayItems = useMemo(
    () => items.filter((i) => i.received_at?.slice(0, 10) === selectedDate),
    [items, selectedDate]
  );

  const filtered = dayItems.filter((i) => filter === 'todas' || i.status === filter);

  const goPrev = () => setSelectedDate((d) => previousBusinessDay(d));
  const goNext = () => {
    const next = nextBusinessDay(selectedDate);
    if (next > todayISO()) return;
    setSelectedDate(next);
  };
  const goToday = () => {
    const t = todayISO();
    setSelectedDate(isBusinessDay(t) ? t : previousBusinessDay(t));
  };

  const isHoliday = !isBusinessDay(selectedDate);
  const totalDay = dayItems.length;

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Intimações</h1>
          <p className="text-muted-foreground text-sm mt-1">Calendário oficial CNJ · Sincronização DJEN automática a cada 6h</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={syncDjen} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sincronizar
          </Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova Intimação</Button>
        </div>
      </div>

      {/* Navegador de data (calendário CNJ) */}
      <div className="bg-card rounded-lg border shadow-card p-3 flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={goPrev} title="Dia útil anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="h-9 w-44"
            max={todayISO()}
          />
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={goNext} title="Próximo dia útil" disabled={nextBusinessDay(selectedDate) > todayISO()}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={goToday}>Hoje</Button>
        <div className="flex items-center gap-2 ml-auto text-sm">
          <span className="font-medium">{formatBR(selectedDate)}</span>
          {isHoliday && <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">Não-útil (CNJ)</Badge>}
          <Badge variant="secondary" className="text-xs">{totalDay} publicação(ões)</Badge>
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
          <p>Nenhuma publicação disponibilizada em {formatBR(selectedDate)}.</p>
          <p className="text-xs mt-1">Use "Sincronizar" para buscar novas intimações deste dia.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((it) => (
            <div key={it.id} className="bg-card rounded-lg p-4 border shadow-card hover:shadow-card-hover flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {it.court && <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{it.court}</span>}
                  <Badge variant={it.status === 'tratada' ? 'outline' : 'default'} className="text-xs">{it.status}</Badge>
                  {it.deadline && <span className="text-xs text-warning">Prazo: {formatBR(it.deadline.slice(0, 10))}</span>}
                </div>
                {(() => {
                  const r = renderIntimContent(it.content);
                  return r.html
                    ? <div className="text-sm mt-2 break-words intim-content prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: r.html }} />
                    : <p className="text-sm mt-2 whitespace-pre-wrap break-words">{r.text}</p>;
                })()}
                <p className="text-xs text-muted-foreground mt-1">Disponibilizada em {formatBR(it.received_at.slice(0, 10))}</p>
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
          <DialogHeader><DialogTitle>Nova Intimação ({formatBR(selectedDate)})</DialogTitle></DialogHeader>
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
