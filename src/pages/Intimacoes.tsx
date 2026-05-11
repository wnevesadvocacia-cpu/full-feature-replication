import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Trash2, CheckSquare, Bell, RefreshCw, ChevronLeft, ChevronRight, CalendarDays, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isBusinessDay, previousBusinessDay, nextBusinessDay, formatBR, todayISO } from '@/lib/cnjCalendar';
import { detectDeadline } from '@/lib/legalDeadlines';
import { renderSafeContent } from '@/lib/sanitizeHtml';
import { useDeadlineReconciliation } from '@/hooks/useDeadlineReconciliation';
import { DeadlineBadge } from '@/components/DeadlineBadge';
import { DeleteGuard } from '@/components/DeleteGuard';

interface Intim {
  id: string;
  court: string | null;
  content: string;
  deadline: string | null;
  status: string;
  received_at: string;
  process_id: string | null;
  classificacao_status?: string | null;
  confianca_classificacao?: number | null;
}

const UNSAFE_STATUSES = new Set(['ambigua_urgente', 'auto_baixa']);

// Títulos comuns da praxis jurídica para tarefas delegadas a partir de intimações
const PRAXIS_TASK_TITLES = [
  'Acompanhar expedição de guia',
  'Avisar cliente sobre perícia',
  'Avisar cliente sobre audiência',
  'Juntar petição',
  'Elaborar contestação',
  'Elaborar réplica',
  'Elaborar recurso (apelação)',
  'Elaborar embargos de declaração',
  'Elaborar agravo de instrumento',
  'Cumprir diligência',
  'Cumprir despacho',
  'Comparecer à audiência',
  'Comparecer à perícia',
  'Solicitar documentos ao cliente',
  'Solicitar cópia integral dos autos',
  'Protocolar manifestação',
  'Protocolar memoriais',
  'Pagar custas processuais',
  'Pagar guia GRU / DARF',
  'Levantar alvará',
  'Substabelecer poderes',
  'Apresentar contrarrazões',
  'Atualizar cálculos',
  'Realizar audiência de conciliação',
  'Verificar publicação no DJE',
];

export default function Intimacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'todas' | 'pendente' | 'tratada'>('pendente');
  const [form, setForm] = useState({ court: '', content: '', deadline: '' });
  const [syncing, setSyncing] = useState(false);
  const [taskIntim, setTaskIntim] = useState<Intim | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', assignee: '', priority: 'alta',
    due_date: '', start_time: '', location: '',
  });
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const t = todayISO();
    return isBusinessDay(t) ? t : previousBusinessDay(t);
  });

  const syncDjen = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-djen', { body: {}, method: 'POST' });
      if (error) throw error;
      // Upstream do CNJ instável: edge devolve 200 + upstream_unavailable
      if (data?.upstream_unavailable) {
        toast({
          title: 'CNJ/DJEN indisponível',
          description: data.error || 'O Diário Eletrônico está instável. Tente novamente em alguns minutos.',
          variant: 'destructive',
        });
        return;
      }
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
    refetchInterval: 60_000, // Sprint1.7: poll de segurança 60s
  });

  // SprintClosure Item 1 (híbrido): reconciliação em background do prazo armazenado
  // contra a RPC canônica calculate_deadline (fonte única SQL). UI continua usando
  // o cálculo síncrono local — sem flicker, sem loading state extra.
  useDeadlineReconciliation(items);

  // Membros da equipe (papéis atribuídos) para preencher o seletor de responsável
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as { user_id: string; role: string }[];
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

  // Marca classificação como revisada pelo advogado + grava prazo manual.
  // Após isso, o reconciliation hook pula este registro (não sobrescreve mais).
  const markReviewed = useMutation({
    mutationFn: async ({ id, deadline }: { id: string; deadline: string }) => {
      const { error } = await (supabase as any).from('intimations').update({
        deadline,
        classificacao_status: 'revisada_advogado',
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimations'] });
      toast({ title: 'Prazo definido manualmente', description: 'Classificação marcada como revisada pelo advogado.' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toTask = useMutation({
    mutationFn: async (payload: { intim: Intim; form: typeof taskForm }) => {
      const { intim, form: tf } = payload;
      const { data, error } = await supabase.from('tasks').insert({
        user_id: user!.id,
        title: tf.title || `Intimação: ${intim.court || 'sem tribunal'}`,
        description: tf.description || null,
        assignee: tf.assignee || null,
        due_date: tf.due_date || null,
        start_time: tf.start_time || null,
        location: tf.location || null,
        priority: tf.priority,
        status: 'pendente',
        process_id: intim.process_id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setTaskIntim(null);
      toast({
        title: 'Responsável definido com sucesso',
        description: 'Acesse o módulo Tarefas para acompanhar.',
      });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar tarefa', description: e.message, variant: 'destructive' }),
  });

  const openTaskDialog = (it: Intim) => {
    const plain = it.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const detectedDeadline = detectDeadline(it.content, it.received_at.slice(0, 10), todayISO());
    setTaskForm({
      title: '', // usuário escolhe / digita
      description: plain,
      assignee: '',
      priority: 'alta',
      due_date: (it.deadline || detectedDeadline?.dueDate || '').slice(0, 10),
      start_time: '',
      location: it.court || '',
    });
    setTaskIntim(it);
  };

  // Dedup frontend REMOVIDO em 2026-05-11.
  // Garantia agora é a UNIQUE parcial (user_id, external_id) WHERE external_id IS NOT NULL
  // + UNIQUE parcial (user_id, received_at, court, md5(content)) WHERE external_id IS NULL.
  // Bug de prefixo legado `djen:hash:` corrigido na migration de normalização de external_id.
  // Se duplicatas voltarem a aparecer aqui, é sinal de que a constraint está quebrada — NÃO mascarar.
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
  // P0 #1: contador == itens renderizados (mesma fonte da lista)
  const totalDay = filtered.length;

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
          {filtered.map((it) => {
            const detectedDeadline = detectDeadline(it.content, it.received_at.slice(0, 10), todayISO());
            const isUnsafe = !!it.classificacao_status && UNSAFE_STATUSES.has(it.classificacao_status);

            return (
              <div key={it.id} className="bg-card rounded-lg p-4 border shadow-card hover:shadow-card-hover flex gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {it.court && <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{it.court}</span>}
                    <Badge variant={it.status === 'tratada' ? 'outline' : 'default'} className="text-xs">{it.status}</Badge>
                    {!isUnsafe && detectedDeadline && !detectedDeadline.isFallback && (
                      <DeadlineBadge deadline={detectedDeadline} receivedAtISO={it.received_at.slice(0, 10)} />
                    )}
                    {!isUnsafe && it.deadline && (!detectedDeadline?.dueDate || detectedDeadline.dueDate !== it.deadline.slice(0, 10)) && <span className="text-xs text-warning">Prazo manual: {formatBR(it.deadline.slice(0, 10))}</span>}
                  </div>

                  {isUnsafe && (
                    <div className="mt-3 rounded-md border-2 border-destructive bg-destructive/10 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-destructive font-bold uppercase text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        PRAZO NÃO IDENTIFICADO — REVISE URGENTE
                      </div>
                      <p className="text-xs text-destructive/90">
                        Classificação automática com confiança {((it.confianca_classificacao ?? 0) * 100).toFixed(0)}%
                        {' '}({it.classificacao_status?.replace('_', ' ')}). Por segurança jurídica, NENHUM prazo presumido é exibido.
                        O advogado responsável deve confirmar manualmente o prazo cabível conforme o teor da decisão.
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          type="date"
                          className="h-8 w-40 text-xs"
                          min={it.received_at.slice(0, 10)}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v) markReviewed.mutate({ id: it.id, deadline: v });
                          }}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          Selecione a data e o prazo será gravado como revisado.
                        </span>
                      </div>
                    </div>
                  )}

                  {!isUnsafe && detectedDeadline?.startDate && detectedDeadline?.dueDate && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      <span className="font-medium">Prazo:</span>
                      <span>início {formatBR(detectedDeadline.startDate)}</span>
                      <span>•</span>
                      <span>vencimento {formatBR(detectedDeadline.dueDate)}</span>
                    </div>
                  )}
                  {(() => {
                    const r = renderSafeContent(it.content);
                    return r.html
                      ? <div className="text-sm mt-2 break-words intim-content prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: r.html }} />
                      : <p className="text-sm mt-2 whitespace-pre-wrap break-words">{r.text}</p>;
                  })()}
                  <p className="text-xs text-muted-foreground mt-1">Disponibilizada em {formatBR(it.received_at.slice(0, 10))}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openTaskDialog(it)}>
                    <CheckSquare className="h-3 w-3 mr-1" /> Criar Tarefa
                  </Button>
                  {it.status !== 'tratada' && (
                    <Button size="sm" variant="ghost" onClick={() => markDone.mutate(it.id)}>Marcar tratada</Button>
                  )}
                  <DeleteGuard>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate(it.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </DeleteGuard>
                </div>
              </div>
            );
          })}
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

      {/* Dialog de delegação de tarefa */}
      <Dialog open={!!taskIntim} onOpenChange={(o) => { if (!o) setTaskIntim(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" /> Responsável pela Tarefa da Intimação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <Label>Título da tarefa *</Label>
              <Input
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="Digite ou selecione abaixo"
                className="mt-1"
                list="praxis-titles"
              />
              <datalist id="praxis-titles">
                {PRAXIS_TASK_TITLES.map((t) => <option key={t} value={t} />)}
              </datalist>
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {PRAXIS_TASK_TITLES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTaskForm((f) => ({ ...f, title: t }))}
                    className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                      taskForm.title === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/40 hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Selecione um título da praxis ou digite um personalizado. A tarefa aparecerá na Agenda no dia escolhido.
              </p>
            </div>
            <div>
              <Label>Descrição / Detalhes</Label>
              <Textarea
                rows={4}
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Responsável</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm h-10"
                  value={
                    teamMembers.some((m) => m.user_id === taskForm.assignee)
                      ? taskForm.assignee
                      : taskForm.assignee
                        ? '__custom__'
                        : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__custom__') setTaskForm({ ...taskForm, assignee: ' ' });
                    else setTaskForm({ ...taskForm, assignee: v });
                  }}
                >
                  <option value="">— Selecionar —</option>
                  {teamMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.role} · {m.user_id.slice(0, 8)}
                    </option>
                  ))}
                  <option value="__custom__">Outro (digitar nome)</option>
                </select>
                {taskForm.assignee &&
                  !teamMembers.some((m) => m.user_id === taskForm.assignee) && (
                    <Input
                      value={taskForm.assignee.trim()}
                      onChange={(e) => setTaskForm({ ...taskForm, assignee: e.target.value })}
                      placeholder="Nome do advogado/responsável"
                      className="mt-2"
                    />
                  )}
              </div>
              <div>
                <Label>Prioridade</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                >
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prazo</Label>
                <Input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={taskForm.start_time}
                  onChange={(e) => setTaskForm({ ...taskForm, start_time: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Local / Tribunal</Label>
              <Input
                value={taskForm.location}
                onChange={(e) => setTaskForm({ ...taskForm, location: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskIntim(null)}>Cancelar</Button>
            <Button
              onClick={() => taskIntim && toTask.mutate({ intim: taskIntim, form: taskForm })}
              disabled={!taskForm.title || toTask.isPending}
            >
              {toTask.isPending ? 'Criando…' : 'Criar Tarefa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
