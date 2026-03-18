import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Filter, GripVertical, MoreHorizontal, Calendar, User } from 'lucide-react';

type ProcessStatus = 'novo' | 'em_andamento' | 'aguardando' | 'concluido';

interface Process {
  id: string;
  number: string;
  title: string;
  client: string;
  type: string;
  status: ProcessStatus;
  dueDate: string;
  lawyer: string;
  value?: string;
}

const statusConfig: Record<ProcessStatus, { label: string; className: string }> = {
  novo: { label: 'Novo', className: 'bg-info/10 text-info border-info/20' },
  em_andamento: { label: 'Em Andamento', className: 'bg-primary/10 text-primary border-primary/20' },
  aguardando: { label: 'Aguardando', className: 'bg-warning/10 text-warning border-warning/20' },
  concluido: { label: 'Concluído', className: 'bg-success/10 text-success border-success/20' },
};

const mockProcesses: Process[] = [
  { id: '1', number: '2024-1847', title: 'Reclamação Trabalhista - Horas Extras', client: 'João Silva', type: 'Trabalhista', status: 'em_andamento', dueDate: '2024-03-15', lawyer: 'Dr. Carlos', value: 'R$ 45.000' },
  { id: '2', number: '2024-1523', title: 'Ação de Indenização', client: 'Maria Santos', type: 'Cível', status: 'aguardando', dueDate: '2024-03-12', lawyer: 'Dra. Ana', value: 'R$ 120.000' },
  { id: '3', number: '2024-1201', title: 'Mandado de Segurança Tributário', client: 'Tech Corp LTDA', type: 'Tributário', status: 'novo', dueDate: '2024-03-20', lawyer: 'Dr. Pedro', value: 'R$ 250.000' },
  { id: '4', number: '2024-0987', title: 'Divórcio Consensual', client: 'Ana Oliveira', type: 'Família', status: 'em_andamento', dueDate: '2024-03-18', lawyer: 'Dra. Lucia', value: 'R$ 8.000' },
  { id: '5', number: '2024-0876', title: 'Execução Fiscal', client: 'Comércio ABC', type: 'Tributário', status: 'concluido', dueDate: '2024-02-28', lawyer: 'Dr. Carlos', value: 'R$ 75.000' },
  { id: '6', number: '2024-0754', title: 'Ação Revisional de Contrato', client: 'Roberto Lima', type: 'Cível', status: 'novo', dueDate: '2024-03-25', lawyer: 'Dr. Pedro', value: 'R$ 32.000' },
  { id: '7', number: '2024-0632', title: 'Rescisão Indireta', client: 'Fernanda Costa', type: 'Trabalhista', status: 'aguardando', dueDate: '2024-03-10', lawyer: 'Dra. Ana', value: 'R$ 55.000' },
  { id: '8', number: '2024-0511', title: 'Ação de Despejo', client: 'Imobiliária XYZ', type: 'Cível', status: 'em_andamento', dueDate: '2024-03-22', lawyer: 'Dra. Lucia', value: 'R$ 15.000' },
];

type ViewMode = 'kanban' | 'list';

export default function Processos() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('kanban');
  const [processes] = useState<Process[]>(mockProcesses);

  const filtered = processes.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.client.toLowerCase().includes(search.toLowerCase()) ||
      p.number.includes(search)
  );

  const columns: ProcessStatus[] = ['novo', 'em_andamento', 'aguardando', 'concluido'];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Processos</h1>
          <p className="text-muted-foreground text-sm mt-1">{processes.length} processos no total</p>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          Novo Processo
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar processo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4" />
          Filtros
        </Button>
        <div className="flex items-center border rounded-md overflow-hidden ml-auto">
          <button
            onClick={() => setView('kanban')}
            className={`px-3 py-1.5 text-sm transition-colors ${view === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 text-sm transition-colors ${view === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
          >
            Lista
          </button>
        </div>
      </div>

      {/* Kanban View */}
      {view === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columns.map((status) => {
            const columnProcesses = filtered.filter((p) => p.status === status);
            const config = statusConfig[status];
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{config.label}</h3>
                    <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 tabular-nums">
                      {columnProcesses.length}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {columnProcesses.map((process) => (
                    <div
                      key={process.id}
                      className="bg-card rounded-lg p-4 shadow-card hover:shadow-card-hover transition-shadow duration-200 cursor-pointer group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs text-muted-foreground font-mono">#{process.number}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <h4 className="text-sm font-medium leading-snug mb-2">{process.title}</h4>
                      <Badge variant="outline" className={`text-xs ${config.className} mb-3`}>
                        {process.type}
                      </Badge>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{process.client}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(process.dueDate).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                      {process.value && (
                        <p className="text-sm font-semibold mt-2 tabular-nums">{process.value}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-card rounded-lg shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nº</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Título</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Valor</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Prazo</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((process) => (
                <tr
                  key={process.id}
                  className="border-b last:border-b-0 hover:bg-muted/30 transition-colors duration-150 cursor-pointer"
                >
                  <td className="py-2 px-4 font-mono text-muted-foreground">#{process.number}</td>
                  <td className="py-2 px-4 font-medium">{process.title}</td>
                  <td className="py-2 px-4">{process.client}</td>
                  <td className="py-2 px-4">
                    <Badge variant="outline" className="text-xs">{process.type}</Badge>
                  </td>
                  <td className="py-2 px-4">
                    <Badge variant="outline" className={`text-xs ${statusConfig[process.status].className}`}>
                      {statusConfig[process.status].label}
                    </Badge>
                  </td>
                  <td className="py-2 px-4 tabular-nums font-medium">{process.value}</td>
                  <td className="py-2 px-4 tabular-nums">{new Date(process.dueDate).toLocaleDateString('pt-BR')}</td>
                  <td className="py-2 px-4">{process.lawyer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
