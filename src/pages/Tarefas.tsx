import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Search, Calendar, Loader2, Pencil, Trash2, AlertTriangle,
} from 'lucide-react';
import { useTasks, useCreateTask, useUpdateTask } from '@/hooks/useTasks';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { DeleteGuard } from '@/components/DeleteGuard';
import { HistoricoConversas } from '@/components/HistoricoConversas';

type TaskPriority = 'alta' | 'media' | 'baixa';
type ViewFilter = 'pendentes' | 'todas' | 'concluidas';

const priorityConfig: Record<TaskPriority, { label: string; className: string }> = {
  alta: { label: 'Alta', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  media: { label: 'Média', className: 'bg-warning/10 text-warning border-warning/20' },
  baixa: { label: 'Baixa', className: 'bg-muted text-muted-foreground border-border' },
};

interface TaskForm {
  title: string; description: string; assignee: string;
  priority: string; due_date: string; process_id: string;
}
const EMPTY_FORM: TaskForm = {
  title: '', description: '', assignee: '',
  priority: 'media', due_date: '', process_id: '',
};

interface Process { id: string; number: string; title: string; client_id?: string | null; client_name?: string | null; client_document?: string | null; }

function useProcessList() {
  return useQuery<Process[]>({
    queryKey: ['process-list-tarefas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select('id, number, title, client_id, clients(name, document)')
        .order('number', { ascending: true })
        .limit(4000);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id,
        number: p.number,
        title: p.title,
        client_id: p.client_id,
        client_name: p.clients?.name ?? null,
        client_document: p.clients?.document ?? null,
      }));
    },
  });
}

const onlyDigits = (s: string) => (s || '').replace(/\D+/g, '');

function ProcessSearchSelect({
  processes, value, onChange,
}: { processes: Process[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => processes.find(p => p.id === value) || null,
    [processes, value]
  );

  // Mostra rótulo do selecionado quando fechado
  useEffect(() => {
    if (!open && selected) setQuery(`${selected.number} — ${selected.title}`);
    if (!open && !selected) setQuery('');
  }, [open, selected]);

  // Fecha ao clicar fora
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return processes.slice(0, 50);
    const qDigits = onlyDigits(q);
    return processes.filter(p => {
      const numDigits = onlyDigits(p.number);
      const docDigits = onlyDigits(p.client_document || '');
      // Busca por número (parcial, ignorando pontuação)
      if (qDigits && (numDigits.includes(qDigits) || (docDigits && docDigits.includes(qDigits)))) return true;
      // Busca textual por título / nome do cliente
      const hay = `${p.number} ${p.title} ${p.client_name ?? ''}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 50);
  }, [processes, query]);

  return (
    <div ref={wrapRef} className="relative mt-1">
      <Input
        value={query}
        onFocus={() => { setOpen(true); if (selected) setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        placeholder="Nº do processo, CPF/CNPJ ou nome do cliente…"
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); setQuery(''); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          title="Limpar"
        >
          ✕
        </button>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg">
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
            onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); }}
          >
            — Nenhum processo —
          </button>
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado.</div>
          ) : results.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(p.id); setOpen(false); }}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-muted ${p.id === value ? 'bg-muted' : ''}`}
            >
              <div className="font-mono text-xs">{p.number}</div>
              <div className="truncate">{p.title}</div>
              {(p.client_name || p.client_document) && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {p.client_name}{p.client_document ? ` · ${p.client_document}` : ''}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Tarefas() {
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('pendentes');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: tasks = [], isLoading } = useTasks();
  const { data: processList = [] } = useProcessList();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { toast } = useToast();
  const qc = useQueryClient();

  const set = (k: keyof TaskForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const filtered = (tasks as any[]).filter((t) => {
    const q = search.toLowerCase();
    const matchSearch =
      t.title.toLowerCase().includes(q) ||
      (t.assignee || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.processes?.number || '').includes(q);
    if (!matchSearch) return false;
    if (viewFilter === 'pendentes') return !t.completed;
    if (viewFilter === 'concluidas') return t.completed;
    return true;
  });

  const pendentes = (tasks as any[]).filter(t => !t.completed).length;
  const concluidas = (tasks as any[]).filter(t => t.completed).length;

  const toggleTask = async (task: any) => {
    await updateTask.mutateAsync({
      id: task.id,
      completed: !task.completed,
      status: !task.completed ? 'concluida' : 'pendente',
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
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setDeleteTarget(null);
      toast({ title: 'Tarefa excluída.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const openEdit = (t: any) => {
    setForm({
      title: t.title ?? '',
      description: t.description ?? '',
      assignee: t.assignee ?? '',
      priority: t.priority ?? 'media',
      due_date: t.due_date ? t.due_date.slice(0, 10) : '',
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
        <Label>Título *</Label>
        <Input className="mt-1" value={form.title} onChange={set('title')} placeholder="Título da tarefa" />
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea className="mt-1" value={form.description} onChange={set('description')} rows={2} placeholder="Detalhes da tarefa" />
      </div>
      <div>
        <Label>Processo vinculado</Label>
        <ProcessSearchSelect
          processes={processList}
          value={form.process_id}
          onChange={(id) => setForm(f => ({ ...f, process_id: id }))}
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Digite o número do processo ou CPF/CNPJ do cliente para localizar.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Responsável</Label>
          <Input className="mt-1" value={form.assignee} onChange={set('assignee')} placeholder="Nome" />
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
      <div>
        <Label>Prazo</Label>
        <Input className="mt-1" type="date" value={form.due_date} onChange={set('due_date')} />
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

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por título, responsável ou nº do processo…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-10" />
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
          <p className="text-sm mt-1">Crie sua primeira tarefa clicando em "Nova Tarefa"</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((task: any) => (
            <div key={task.id}
              className={`bg-card rounded-lg px-4 py-3 shadow-card hover:shadow-card-hover transition-shadow duration-200 flex items-center gap-4 group ${task.completed ? 'opacity-60' : ''}`}>
              <Checkbox checked={task.completed} onCheckedChange={() => toggleTask(task)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                    {task.title}
                  </p>
                  {task.processes?.number && (
                    <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-mono">
                      #{task.processes.number}
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
                )}
              </div>
              <Badge variant="outline"
                className={`text-xs shrink-0 ${priorityConfig[task.priority as TaskPriority]?.className || ''}`}>
                {priorityConfig[task.priority as TaskPriority]?.label || task.priority}
              </Badge>
              {task.due_date && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(task.due_date.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                </div>
              )}
              {task.assignee && (
                <span className="text-xs text-muted-foreground shrink-0 hidden md:block">{task.assignee}</span>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(task)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <DeleteGuard>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                    onClick={() => setDeleteTarget(task)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </DeleteGuard>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="max-w-md">
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
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!form.title || saving}>
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
    </div>
  );
}
