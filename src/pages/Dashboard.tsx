import { MetricCard } from '@/components/MetricCard';
import { Briefcase, CheckSquare, DollarSign, Users, Loader2 } from 'lucide-react';
import { useProcesses } from '@/hooks/useProcesses';
import { useTasks } from '@/hooks/useTasks';
import { useClients } from '@/hooks/useClients';
import { useInvoices } from '@/hooks/useInvoices';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function Dashboard() {
  // useProcesses returns { rows, total } — extract array safely
  const { data: processesData, isLoading: lp } = useProcesses();
  const { data: tasks = [], isLoading: lt } = useTasks();
  const { data: clients = [], isLoading: lc } = useClients();
  const { data: invoices = [], isLoading: li } = useInvoices();

  const processes = processesData?.rows ?? [];

  const isLoading = lp || lt || lc || li;

  const activeProcesses = processes.filter((p: any) => p.status !== 'concluido').length;
  const pendingTasks    = (tasks as any[]).filter(t => !t.completed).length;
  const activeClients   = (clients as any[]).filter(c => c.status === 'ativo').length;
  const totalBilled     = (invoices as any[])
    .filter(i => i.status === 'pago')
    .reduce((sum, i) => sum + Number(i.amount), 0);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral do seu escritório</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Processos Ativos"  value={activeProcesses}           icon={Briefcase}   description="em andamento" />
        <MetricCard title="Tarefas Pendentes" value={pendingTasks}              icon={CheckSquare} description="aguardando conclusão" />
        <MetricCard title="Faturamento"       value={formatCurrency(totalBilled)} icon={DollarSign}  description="total recebido" />
        <MetricCard title="Clientes Ativos"   value={activeClients}             icon={Users}       description="cadastrados" />
      </div>

      {processes.length === 0 && (tasks as any[]).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-xl font-display font-semibold">Bem-vindo ao WnevesBox!</p>
          <p className="text-sm mt-2">Comece cadastrando seus clientes e processos para ver as métricas aqui.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card rounded-lg p-5 shadow-card">
            <h3 className="font-display font-semibold mb-4">Últimos Processos</h3>
            <div className="space-y-3">
              {processes.slice(0, 5).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">#{p.number} · {p.clients?.name || '—'}</p>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">
                    {p.status?.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-lg p-5 shadow-card">
            <h3 className="font-display font-semibold mb-4">Tarefas Recentes</h3>
            <div className="space-y-3">
              {(tasks as any[]).filter(t => !t.completed).slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.assignee || '—'}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    t.priority === 'alta'  ? 'bg-destructive/10 text-destructive' :
                    t.priority === 'media' ? 'bg-warning/10 text-warning' :
                                             'bg-muted text-muted-foreground'
                  }`}>
                    {t.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
          }
