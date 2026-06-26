import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ProcessSearchSelect } from '@/components/ProcessSearchSelect';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Search, Calendar, Loader2, Pencil, Trash2, AlertTriangle, Info, ArrowRight, FileText, User, Check,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTasks, useCreateTask, useUpdateTask } from '@/hooks/useTasks';
import { useCanDelete } from '@/hooks/useUserRole';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { renderSafeContent } from '@/lib/sanitizeHtml';
import { ToastAction } from '@/components/ui/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { DeleteGuard } from '@/components/DeleteGuard';
import { HistoricoConversas } from '@/components/HistoricoConversas';
import { PRAXIS_TASK_TITLES } from '@/lib/praxisTitles';

type TaskPriority = 'alta' | 'media' | 'baixa';
type ViewFilter = 'pendentes' | 'todas' | 'concluidas';

const priorityConfig: Record<TaskPriority, { label: string; className: string }> = {
  alta: { label: 'Alta', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  media: { label: 'Média', className: 'bg-warning/10 text-warning border-warning/20' },
  baixa: { label: 'Baixa', className: 'bg-muted text-muted-foreground border-border' },
};

interface TaskForm {
  title: string; description: string; assignee: string;
  priority: string; due_date: string; start_date: string; process_id: string;
}
const EMPTY_FORM: TaskForm = {
  title: '', description: '', assignee: '',
  priority: 'media', due_date: '', start_date: '', process_id: '',
};

const TASK_DIALOG_CLASS = "!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-[34rem] max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6";

function decodeHtml(s: string): string {
  if (!s) return '';
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea');
    el.innerHTML = s;
    return el.value;
  }
  return s;
}

function fmtDate(s?: string) {
  return s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}
function fmtDateTime(s?: string) {
  return s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

function abbreviateName(fullName?: string | null): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const connectors = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del']);
  const significant = parts.filter(p => !connectors.has(p.toLowerCase()));
  if (significant.length === 0) return parts[0];
  if (significant.length === 1) return significant[0];
  return `${significant[0]} ${significant[significant.length - 1]}`;
}


export default function Tarefas() {
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('pendentes');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [overviewTarget, setOverviewTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: tasks = [], isLoading } = useTasks();
  
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = useCanDelete();

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_team_members');
      if (error) throw error;
      return (data || []) as { user_id: string; email: string; full_name?: string; roles: string[] }[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const set = (k: keyof TaskForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const onlyDigits = (s: string) => (s || '').replace(/\D+/g, '');
  const filtered = (tasks as any[]).filter((t) => {
    const q = search.toLowerCase().trim();
    const qDigits = onlyDigits(q);
    const procNumDigits = onlyDigits(t.processes?.number || '');
    const matchSearch = !q ||
      t.title.toLowerCase().includes(q) ||
      (t.assignee || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.processes?.number || '').toLowerCase().includes(q) ||
      (qDigits && procNumDigits.includes(qDigits));
    if (!matchSearch) return false;
    if (viewFilter === 'pendentes') return !t.completed;
    if (viewFilter === 'concluidas') return t.completed;
    return true;
  }).sort((a: any, b: any) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return da - db;
  });

  const pendentes = (tasks as any[]).filter(t => !t.completed).length;
  const concluidas = (tasks as any[]).filter(t => t.completed).length;

  const toggleTask = async (task: any) => {
    const willComplete = !task.completed;
    await updateTask.mutateAsync({
      id: task.id,
      completed: willComplete,
      status: willComplete ? 'concluida' : 'pendente',
    });
    toast({
      title: willComplete ? 'Tarefa concluída' : 'Tarefa reaberta',
      description: willComplete && viewFilter === 'pendentes'
        ? 'Ela saiu da lista de pendentes. Veja em "Concluídas" ou "Todas".'
        : undefined,
      action: (
        <ToastAction altText="Desfazer" onClick={() => {
          updateTask.mutate({
            id: task.id,
            completed: !willComplete,
            status: !willComplete ? 'concluida' : 'pendente',
          });
        }}>Desfazer</ToastAction>
      ),
    });
  };

  const handleCreate = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      await createTask.mutateAsync({
        title: form.title,
        description: form.description || undefined,
        assignee: form.assignee || undefined,
        priority: form.priority,
        due_date: form.due_date || undefined,
        start_date: form.start_date || undefined,
        process_id: form.process_id || undefined,
      });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      toast({ title: 'Tarefa criada!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editTarget || !form.title) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').update({
        title: form.title,
        description: form.description || null,
        assignee: form.assignee || null,
        priority: form.priority,
        due_date: form.due_date || null,
        start_date: form.start_date || null,
        process_id: form.process_id || null,
      }).eq('id', editTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setEditTarget(null);
      toast({ title: 'Tarefa atualizada!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const backup = deleteTarget;
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', backup.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setDeleteTarget(null);
      toast({
        title: 'Tarefa excluída.',
        action: (
          <ToastAction altText="Desfazer" onClick={async () => {
            const { processes, ...row } = backup;
            const { error: restoreErr } = await supabase.from('tasks').insert(row);
            if (restoreErr) {
              toast({ title: 'Erro ao desfazer', description: restoreErr.message, variant: 'destructive' });
              return;
            }
            qc.invalidateQueries({ queryKey: ['tasks'] });
            toast({ title: 'Exclusão desfeita.' });
          }}>Desfazer</ToastAction>
        ),
      });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const openEdit = (t: any) => {
    setForm({
      title: t.title ?? '',
      description: decodeHtml(t.description ?? ''),
      assignee: t.assignee ?? '',
      priority: t.priority ?? 'media',
      due_date: t.due_date ? t.due_date.slice(0, 10) : '',
      start_date: t.start_date ? t.start_date.slice(0, 10) : '',
      process_id: t.process_id ?? '',
    });
    setEditTarget(t);
  };

  if (isLoading) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const taskFormFields = (
    <div className="space-y-4">
      <div>
        <Label>Processo vinculado *</Label>
        <ProcessSearchSelect
          value={form.process_id}
          onChange={(id) => setForm(f => ({ ...f, process_id: id }))}
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Comece pelo processo: digite o número ou CPF/CNPJ do cliente.
        </p>
      </div>
      <div>
        <Label>Título *</Label>
        <Input
          className="mt-1"
          value={form.title}
          onChange={set('title')}
          placeholder="Digite ou selecione abaixo"
          list="praxis-titles-tarefas"
        />
        <datalist id="praxis-titles-tarefas">
          {PRAXIS_TASK_TITLES.map((t) => <option key={t} value={t} />)}
        </datalist>
        <div className="mt-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {PRAXIS_TASK_TITLES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((f) => ({ ...f, title: t }))}
              className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                form.title === t
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 hover:bg-muted text-foreground border-border'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Selecione um título da praxis ou digite um personalizado.
        </p>
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea className="mt-1" value={form.description} onChange={set('description')} rows={2} placeholder="Detalhes da tarefa" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Responsável</Label>
          <select
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm h-10"
            value={form.assignee}
            onChange={set('assignee')}
          >
            <option value="">— Selecione —</option>
            {teamMembers.map((m) => (
              <option key={m.user_id} value={m.email}>{m.email}</option>
            ))}
            {form.assignee && !teamMembers.some((m) => m.email === form.assignee) && (
              <option value={form.assignee}>{form.assignee}</option>
            )}
          </select>
        </div>
        <div>
          <Label>Prioridade</Label>
          <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={form.priority} onChange={set('priority')}>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-primary" /> Data inicial
          </Label>
          <Input className="mt-1" type="date" value={form.start_date} onChange={set('start_date')} />
          <p className="text-[11px] text-muted-foreground mt-1">
            Aparece na agenda a partir desta data e permanece até ser concluída.
          </p>
        </div>
        <div>
          <Label className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-destructive" /> Prazo final
          </Label>
          <Input className="mt-1" type="date" value={form.due_date} onChange={set('due_date')} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Tarefas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {pendentes} pendentes · {concluidas} concluídas
          </p>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Tarefa
        </Button>
      </div>

      {/* Banner de alerta piscante para prazos próximos */}
      {(() => {
        const today = new Date();
        today.setHours(0,0,0,0);
        const urgentTasks = (tasks as any[]).filter((t: any) => {
          if (!t.due_date || t.completed) return false;
          const due = new Date(t.due_date.slice(0,10) + 'T12:00:00');
          due.setHours(0,0,0,0);
          const daysLeft = Math.ceil((due.getTime() - today.getTime()) / (1000*60*60*24));
          return daysLeft <= 2;
        }).sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        if (urgentTasks.length === 0) return null;
        const nearest = urgentTasks[0];
        const due = new Date(nearest.due_date.slice(0,10) + 'T12:00:00');
        due.setHours(0,0,0,0);
        const daysLeft = Math.ceil((due.getTime() - today.getTime()) / (1000*60*60*24));
        return (
          <div className="animate-blink rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 flex items-center gap-3 text-sm text-destructive font-medium">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              {urgentTasks.length === 1 ? (
                <span>"{nearest.title}" vence {daysLeft < 0 ? `há ${Math.abs(daysLeft)} dia(s)` : daysLeft === 0 ? 'hoje' : daysLeft === 1 ? 'amanhã' : `em ${daysLeft} dias`} — {fmtDate(nearest.due_date)}</span>
              ) : (
                <span>{urgentTasks.length} tarefas próximas do vencimento. A mais urgente: "{nearest.title}" {daysLeft < 0 ? `vencida há ${Math.abs(daysLeft)} dia(s)` : daysLeft === 0 ? 'vence hoje' : daysLeft === 1 ? 'vence amanhã' : `vence em ${daysLeft} dias`} — {fmtDate(nearest.due_date)}</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 max-w-sm space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar título, responsável ou nº do processo…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <p className="leading-relaxed">
              Esta busca lista apenas processos com <span className="font-medium text-foreground">tarefas pendentes</span>.
              Para buscar todos os processos,{" "}
              <Link to="/processos" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
                acesse Processos <ArrowRight className="h-3 w-3" />
              </Link>.
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {([
            { v: 'pendentes', l: 'Pendentes' },
            { v: 'todas', l: 'Todas' },
            { v: 'concluidas', l: 'Concluídas' },
          ] as { v: ViewFilter; l: string }[]).map(({ v, l }) => (
            <Button key={v} size="sm" variant={viewFilter === v ? 'default' : 'outline'}
              onClick={() => setViewFilter(v)}>
              {l}
            </Button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Nenhuma tarefa encontrada</p>
          <p className="text-sm mt-1">
            {search
              ? 'A busca filtra tarefas já criadas. Para vincular a um processo, clique em "Nova Tarefa".'
              : 'Crie sua primeira tarefa clicando em "Nova Tarefa"'}
          </p>
          {search && (
            <Button className="mt-3" size="sm" onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova Tarefa
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((task: any) => {
            const memberById = new Map(teamMembers.map(m => [m.user_id, m.email]));
            const creatorLabel = memberById.get(task.created_by) || memberById.get(task.user_id) || '—';
            const completerLabel = task.completed_by ? (memberById.get(task.completed_by) || '—') : null;
            const dueDate = task.due_date ? new Date(task.due_date.slice(0,10) + 'T12:00:00') : null;
            const today = new Date();
            today.setHours(0,0,0,0);
            const dueDay = dueDate ? new Date(dueDate) : null;
            if (dueDay) dueDay.setHours(0,0,0,0);
            const daysLeft = dueDay ? Math.ceil((dueDay.getTime() - today.getTime()) / (1000*60*60*24)) : null;
            const showDeadlineAlert = !task.completed && dueDay && daysLeft !== null && daysLeft <= 2;
            return (
            <div key={task.id}
              className={`bg-card rounded-lg px-4 py-3 shadow-card hover:shadow-card-hover transition-shadow duration-200 flex items-center gap-4 group ${task.completed ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                    {task.title}
                  </p>
                  {task.processes?.number && (
                    <button
                      type="button"
                      onClick={() => setOverviewTarget(task)}
                      title="Ver detalhes da tarefa"
                      className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-mono hover:bg-blue-100 hover:underline cursor-pointer"
                    >
                      #{task.processes.number}
                    </button>
                  )}
                  {showDeadlineAlert && (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${daysLeft < 0 ? 'bg-destructive/10 text-destructive border-destructive/30' : daysLeft === 0 ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-warning/10 text-warning border-warning/30'}`}>
                      <AlertTriangle className="h-3 w-3" />
                      {daysLeft < 0 ? `Vencida há ${Math.abs(daysLeft)} dia(s)` : daysLeft === 0 ? 'Vence hoje' : `Vence em ${daysLeft} dia(s)`}
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{decodeHtml(task.description)}</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Criada por <span className="font-medium">{creatorLabel}</span> em {fmtDate(task.created_at)}
                  {task.completed && completerLabel && (
                    <> · Concluída por <span className="font-medium">{completerLabel}</span> em {fmtDateTime(task.completed_at)}</>
                  )}
                </p>
              </div>
              <Badge variant="outline"
                className={`text-xs shrink-0 ${priorityConfig[task.priority as TaskPriority]?.className || ''}`}>
                {priorityConfig[task.priority as TaskPriority]?.label || task.priority}
              </Badge>
              {task.due_date && (
                <div className="flex flex-col items-start text-xs shrink-0">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold leading-none mb-0.5">Vencimento</span>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span className={showDeadlineAlert ? (daysLeft && daysLeft < 0 ? 'text-destructive font-semibold' : 'text-warning font-semibold') : ''}>{new Date(task.due_date.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  </div>
                </div>
              )}
              {task.assignee && (
                <div className="flex flex-col items-end shrink-0 hidden md:flex">
                  {(() => {
                    const member = teamMembers.find(m => m.email === task.assignee);
                    const short = member?.full_name ? abbreviateName(member.full_name) : '';
                    return (
                      <>
                        {short && <span className="text-xs font-semibold text-foreground leading-none">{short}</span>}
                        <span className="text-[11px] text-muted-foreground leading-none mt-0.5">{task.assignee}</span>
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="flex gap-1 items-center">
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEdit(task)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!task.completed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-success border-success/40 hover:bg-success/10 hover:text-success"
                    onClick={() => toggleTask(task)}
                    disabled={updateTask.isPending}
                    title="Concluir tarefa (mantida no histórico para auditoria)"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Concluir
                  </Button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}


      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className={TASK_DIALOG_CLASS}>
          <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
          {taskFormFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.title || saving}>
              {saving ? 'Salvando…' : 'Criar Tarefa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>Editar Tarefa</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto pr-1">
            <div>
              {taskFormFields}
            </div>
            <div className="border-l md:pl-4 flex flex-col min-h-[400px]">
              <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                Histórico de conversas
              </p>
              {editTarget?.id && (
                <div className="flex-1">
                  <HistoricoConversas taskId={editTarget.id} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            {!canManage && (
              <p className="text-xs text-muted-foreground mr-auto">
                Apenas administradores e gerentes podem salvar alterações.
              </p>
            )}
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!form.title || saving || !canManage}>
              {saving ? 'Salvando…' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Excluir Tarefa
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Excluir <span className="font-semibold">"{deleteTarget?.title}"</span>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Overview Dialog (read-only) */}
      <Dialog open={!!overviewTarget} onOpenChange={(o) => { if (!o) setOverviewTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" /> {overviewTarget?.title}
            </DialogTitle>
          </DialogHeader>
          {overviewTarget && (() => {
            const t = overviewTarget;
            const dueDate = t.due_date ? new Date(t.due_date.slice(0,10) + 'T12:00:00') : null;
            const today = new Date();
            today.setHours(0,0,0,0);
            const dueDay = dueDate ? new Date(dueDate) : null;
            if (dueDay) dueDay.setHours(0,0,0,0);
            const daysLeft = dueDay ? Math.ceil((dueDay.getTime() - today.getTime()) / (1000*60*60*24)) : null;
            const isOverdue = daysLeft !== null && daysLeft < 0 && !t.completed;
            const isToday = daysLeft === 0 && !t.completed;
            const memberById = new Map(teamMembers.map(m => [m.user_id, m.email]));
            const creatorLabel = memberById.get(t.created_by) || memberById.get(t.user_id) || '—';
            const completerLabel = t.completed_by ? (memberById.get(t.completed_by) || '—') : null;
            return (
              <div className="space-y-3 text-sm">
                {t.processes?.number && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Processo:</span>
                    <span className="font-mono font-medium text-blue-700">{t.processes.number}</span>
                  </div>
                )}
                {t.description && (() => {
                  const r = renderSafeContent(t.description);
                  return r.html
                    ? <div className="bg-muted/40 rounded-md p-3 text-sm break-words prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: r.html }} />
                    : <div className="bg-muted/40 rounded-md p-3 text-sm whitespace-pre-wrap">{decodeHtml(r.text || '')}</div>;
                })()}
                <div className="grid grid-cols-2 gap-3">
                  {t.assignee && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{t.assignee}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={priorityConfig[t.priority as TaskPriority]?.className || ''}>
                      {priorityConfig[t.priority as TaskPriority]?.label || t.priority}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {t.start_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-500" />
                      <span>Início: {fmtDate(t.start_date)}</span>
                    </div>
                  )}
                  {t.due_date && (
                    <div className={`flex items-center gap-2 ${isOverdue || isToday ? 'text-destructive font-semibold' : ''}`}>
                      <Calendar className={`h-4 w-4 ${isOverdue || isToday ? 'text-destructive' : 'text-red-500'}`} />
                      <span>Prazo: {new Date(t.due_date.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      {isOverdue && <span className="text-[11px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">Vencida</span>}
                      {isToday && <span className="text-[11px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">Vence hoje</span>}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
                  <p>Criada por <span className="font-medium">{creatorLabel}</span> em {fmtDate(t.created_at)}</p>
                  {t.completed && completerLabel && (
                    <p className="mt-0.5">Concluída por <span className="font-medium">{completerLabel}</span> em {fmtDateTime(t.completed_at)}</p>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverviewTarget(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
