import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Filter, Calendar, Clock, AlertTriangle } from 'lucide-react';

type TaskPriority = 'alta' | 'media' | 'baixa';
type TaskStatus = 'pendente' | 'em_progresso' | 'concluida';

interface Task {
  id: string;
  title: string;
  description: string;
  process?: string;
  assignee: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  completed: boolean;
}

const priorityConfig: Record<TaskPriority, { label: string; className: string }> = {
  alta: { label: 'Alta', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  media: { label: 'Média', className: 'bg-warning/10 text-warning border-warning/20' },
  baixa: { label: 'Baixa', className: 'bg-muted text-muted-foreground border-border' },
};

const mockTasks: Task[] = [
  { id: '1', title: 'Protocolar petição inicial', description: 'Enviar petição ao TRT-2', process: '#2024-1847', assignee: 'Dr. Carlos', priority: 'alta', status: 'pendente', dueDate: '2024-03-12', completed: false },
  { id: '2', title: 'Preparar recurso ordinário', description: 'Elaborar recurso contra sentença', process: '#2024-1523', assignee: 'Dra. Ana', priority: 'alta', status: 'em_progresso', dueDate: '2024-03-10', completed: false },
  { id: '3', title: 'Agendar perícia', description: 'Contatar perito e agendar data', process: '#2024-1201', assignee: 'Dr. Pedro', priority: 'media', status: 'pendente', dueDate: '2024-03-18', completed: false },
  { id: '4', title: 'Revisar contrato social', description: 'Revisar alterações contratuais', process: '#2024-0987', assignee: 'Dra. Lucia', priority: 'baixa', status: 'pendente', dueDate: '2024-03-20', completed: false },
  { id: '5', title: 'Enviar notificação extrajudicial', description: 'Notificar parte contrária', process: '#2024-0876', assignee: 'Dr. Carlos', priority: 'media', status: 'concluida', dueDate: '2024-03-08', completed: true },
  { id: '6', title: 'Elaborar parecer jurídico', description: 'Análise de viabilidade', assignee: 'Dra. Ana', priority: 'media', status: 'em_progresso', dueDate: '2024-03-15', completed: false },
  { id: '7', title: 'Atualizar cadastro do cliente', description: 'Atualizar dados cadastrais', assignee: 'Dr. Pedro', priority: 'baixa', status: 'pendente', dueDate: '2024-03-22', completed: false },
  { id: '8', title: 'Preparar audiência de instrução', description: 'Organizar documentos e testemunhas', process: '#2024-1847', assignee: 'Dr. Carlos', priority: 'alta', status: 'pendente', dueDate: '2024-03-13', completed: false },
];

export default function Tarefas() {
  const [search, setSearch] = useState('');
  const [tasks, setTasks] = useState<Task[]>(mockTasks);

  const filtered = tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.assignee.toLowerCase().includes(search.toLowerCase())
  );

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed, status: t.completed ? 'pendente' : 'concluida' } : t))
    );
  };

  const pendentes = filtered.filter((t) => !t.completed);
  const concluidas = filtered.filter((t) => t.completed);

  const isOverdue = (date: string) => new Date(date) < new Date() && !mockTasks.find((t) => t.dueDate === date)?.completed;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Tarefas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {pendentes.length} pendentes · {concluidas.length} concluídas
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar tarefa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4" />
          Filtros
        </Button>
      </div>

      {/* Pending tasks */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pendentes</h3>
        <div className="space-y-1">
          {pendentes.map((task) => (
            <div
              key={task.id}
              className="bg-card rounded-lg px-4 py-3 shadow-card hover:shadow-card-hover transition-shadow duration-200 flex items-center gap-4 group"
            >
              <Checkbox checked={task.completed} onCheckedChange={() => toggleTask(task.id)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{task.title}</p>
                  {task.process && (
                    <span className="text-xs text-muted-foreground font-mono">{task.process}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
              </div>
              <Badge variant="outline" className={`text-xs shrink-0 ${priorityConfig[task.priority].className}`}>
                {priorityConfig[task.priority].label}
              </Badge>
              <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Calendar className="h-3 w-3" />
                <span className="tabular-nums">{new Date(task.dueDate).toLocaleDateString('pt-BR')}</span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{task.assignee}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Completed tasks */}
      {concluidas.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Concluídas</h3>
          <div className="space-y-1">
            {concluidas.map((task) => (
              <div
                key={task.id}
                className="bg-card rounded-lg px-4 py-3 shadow-card flex items-center gap-4 opacity-60"
              >
                <Checkbox checked={task.completed} onCheckedChange={() => toggleTask(task.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-through">{task.title}</p>
                </div>
                <span className="text-xs text-muted-foreground">{task.assignee}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
