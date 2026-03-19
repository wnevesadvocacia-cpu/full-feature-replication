import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Filter, Calendar, Loader2 } from 'lucide-react';
import { useTasks, useCreateTask, useUpdateTask } from '@/hooks/useTasks';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type TaskPriority = 'alta' | 'media' | 'baixa';

const priorityConfig: Record<TaskPriority, { label: string; className: string }> = {
  alta: { label: 'Alta', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  media: { label: 'Média', className: 'bg-warning/10 text-warning border-warning/20' },
  baixa: { label: 'Baixa', className: 'bg-muted text-muted-foreground border-border' },
};

export default function Tarefas() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assignee: '', priority: 'media', due_date: '' });
  const { data: tasks = [], isLoading } = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { toast } = useToast();

  const filtered = (tasks as any[]).filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.assignee || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggleTask = async (task: any) => {
    const newCompleted = !task.completed;
    await updateTask.mutateAsync({
      id: task.id,
      completed: newCompleted,
      status: newCompleted ? 'concluida' : 'pendente',
    });
  };

  const pendentes = filtered.filter((t: any) => !t.completed);
  const concluidas = filtered.filter((t: any) => t.completed);

  const handleCreate = async () => {
    if (!form.title) return;
    try {
      await createTask.mutateAsync({
        title: form.title,
        description: form.description || undefined,
        assignee: form.assignee || undefined,
        priority: form.priority,
        due_date: form.due_date || undefined,
      });
      setForm({ title: '', description: '', assignee: '', priority: 'media', due_date: '' });
      setOpen(false);
      toast({ title: 'Tarefa criada com sucesso!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Tarefas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {pendentes.length} pendentes · {concluidas.length} concluídas
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" />Nova Tarefa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Título da tarefa" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalhes da tarefa" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Input value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))} placeholder="Nome" />
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Prazo</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={createTask.isPending}>
                {createTask.isPending ? 'Salvando...' : 'Criar Tarefa'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar tarefa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button variant="outline" size="sm"><Filter className="h-4 w-4" />Filtros</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Nenhuma tarefa encontrada</p>
          <p className="text-sm mt-1">Crie sua primeira tarefa clicando em "Nova Tarefa"</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pendentes</h3>
            <div className="space-y-1">
              {pendentes.map((task: any) => (
                <div key={task.id} className="bg-card rounded-lg px-4 py-3 shadow-card hover:shadow-card-hover transition-shadow duration-200 flex items-center gap-4 group">
                  <Checkbox checked={task.completed} onCheckedChange={() => toggleTask(task)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{task.title}</p>
                      {task.processes?.number && <span className="text-xs text-muted-foreground font-mono">#{task.processes.number}</span>}
                    </div>
                    {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                  </div>
                  <Badge variant="outline" className={`text-xs shrink-0 ${priorityConfig[task.priority as TaskPriority]?.className || ''}`}>
                    {priorityConfig[task.priority as TaskPriority]?.label || task.priority}
                  </Badge>
                  {task.due_date && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Calendar className="h-3 w-3" />
                      <span className="tabular-nums">{new Date(task.due_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                  {task.assignee && <span className="text-xs text-muted-foreground shrink-0">{task.assignee}</span>}
                </div>
              ))}
            </div>
          </div>

          {concluidas.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Concluídas</h3>
              <div className="space-y-1">
                {concluidas.map((task: any) => (
                  <div key={task.id} className="bg-card rounded-lg px-4 py-3 shadow-card flex items-center gap-4 opacity-60">
                    <Checkbox checked={task.completed} onCheckedChange={() => toggleTask(task)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-through">{task.title}</p>
                    </div>
                    {task.assignee && <span className="text-xs text-muted-foreground">{task.assignee}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
