import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Users, CheckSquare, AlertCircle, TrendingUp, Clock, Plus } from 'lucide-react';

interface ProcessStats {
  total: number;
  active: number;
  concluded: number;
  pending: number;
}

interface RecentProcess {
  id: string;
  number: string;
  title: string;
  status: string;
  updated_at: string;
}

interface RecentTask {
  id: string;
  title: string;
  due_date: string;
  completed: boolean;
  process_id: string;
}

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  em_andamento: 'Em Andamento',
  aguardando: 'Aguardando',
  concluido: 'Concluído',
  ativo: 'Ativo',
  arquivado: 'Arquivado',
  recursal: 'Recursal',
  sobrestamento: 'Sobrestamento',
  active: 'Ativo',
  archived: 'Arquivado',
  pending: 'Aguardando',
  closed: 'Concluído',
};

const STATUS_COLORS: Record<string, string> = {
  novo: 'bg-blue-100 text-blue-800',
  em_andamento: 'bg-green-100 text-green-800',
  aguardando: 'bg-yellow-100 text-yellow-800',
  concluido: 'bg-gray-100 text-gray-800',
  ativo: 'bg-green-100 text-green-800',
  arquivado: 'bg-gray-100 text-gray-800',
  recursal: 'bg-purple-100 text-purple-800',
  sobrestamento: 'bg-orange-100 text-orange-800',
  active: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  closed: 'bg-gray-100 text-gray-800',
};

export default function Dashboard() {
  const [stats, setStats] = useState<ProcessStats>({ total: 0, active: 0, concluded: 0, pending: 0 });
  const [clientCount, setClientCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [recentProcesses, setRecentProcesses] = useState<RecentProcess[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<RecentTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        // Process stats — use count queries (not page-limited)
        const [
          { count: totalCount },
          { count: activeCount },
          { count: concludedCount },
          { count: pendingCount },
          { count: clientTotal },
          { count: taskTotal },
        ] = await Promise.all([
          supabase.from('processes').select('*', { count: 'exact', head: true }),
          supabase.from('processes').select('*', { count: 'exact', head: true })
            .in('status', ['ativo','em_andamento','active','novo','recursal','aguardando','pending','sobrestamento']),
          supabase.from('processes').select('*', { count: 'exact', head: true })
            .in('status', ['concluido', 'closed']),
          supabase.from('processes').select('*', { count: 'exact', head: true })
            .in('status', ['aguardando', 'pending']),
          supabase.from('clients').select('*', { count: 'exact', head: true }),
          supabase.from('tasks').select('*', { count: 'exact', head: true })
            .eq('completed', false)
            .not('assignee', 'eq', 'movimentacao')
            .not('assignee', 'eq', 'documento')
            .not('assignee', 'eq', 'agenda'),
        ]);

        setStats({
          total: totalCount ?? 0,
          active: activeCount ?? 0,
          concluded: concludedCount ?? 0,
          pending: pendingCount ?? 0,
        });
        setClientCount(clientTotal ?? 0);
        setTaskCount(taskTotal ?? 0);

        // Recent processes
        const { data: recent } = await supabase
          .from('processes')
          .select('id, number, title, status, updated_at')
          .order('updated_at', { ascending: false })
          .limit(5);
        setRecentProcesses(recent ?? []);

        // Upcoming tasks (include agenda items for dashboard)
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, due_date, completed, process_id, assignee')
          .eq('completed', false)
          .not('due_date', 'is', null)
          .not('assignee', 'eq', 'movimentacao')
          .not('assignee', 'eq', 'documento')
          .order('due_date', { ascending: true })
          .limit(8);
        setUpcomingTasks(tasks ?? []);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    const d = iso.includes('T') ? iso : iso.slice(0,10) + 'T12:00:00';
    return new Date(d).toLocaleDateString('pt-BR');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link to="/processos">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Processo
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <FileText className="h-4 w-4" /> Total Processos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">{loading ? '…' : stats.total.toLocaleString('pt-BR')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" /> Processos Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-700">{loading ? '…' : stats.active.toLocaleString('pt-BR')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" /> Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-700">{loading ? '…' : clientCount.toLocaleString('pt-BR')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" /> Tarefas Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-700">{loading ? '…' : taskCount.toLocaleString('pt-BR')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Processes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Processos Recentes</span>
              <Link to="/processos" className="text-sm font-normal text-blue-600 hover:underline">Ver todos</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-gray-400">Carregando…</p>
            ) : recentProcesses.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum processo encontrado.</p>
            ) : recentProcesses.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-2 py-1 border-b last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.number || p.title || '—'}</p>
                  <p className="text-xs text-gray-500 truncate">{p.title ?? '—'}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge className={`text-xs ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[p.status] ?? p.status}
                  </Badge>
                  <span className="text-xs text-gray-400">{formatDate(p.updated_at)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Próximas Tarefas</span>
              <Link to="/tarefas" className="text-sm font-normal text-blue-600 hover:underline">Ver todas</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-gray-400">Carregando…</p>
            ) : upcomingTasks.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma tarefa pendente.</p>
            ) : upcomingTasks.map((t) => {
                const isOverdue = t.due_date && new Date(t.due_date.slice(0,10) + 'T12:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T12:00:00');
                const isAgenda = (t as any).assignee === 'agenda';
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckSquare className={`h-4 w-4 shrink-0 ${isOverdue ? 'text-red-400' : 'text-gray-400'}`} />
                      <p className={`text-sm truncate ${isOverdue ? 'text-red-700 font-medium' : ''}`}>{t.title}</p>
                      {isAgenda && <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded shrink-0">Agenda</span>}
                    </div>
                    <span className={`text-xs shrink-0 ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>{formatDate(t.due_date)}</span>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gray-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Concluídos</p>
            <p className="text-2xl font-bold text-gray-700">{loading ? '…' : stats.concluded.toLocaleString('pt-BR')}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Aguardando</p>
            <p className="text-2xl font-bold text-yellow-700">{loading ? '…' : stats.pending.toLocaleString('pt-BR')}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Taxa Conclusão</p>
            <p className="text-2xl font-bold text-gray-700">
              {loading || stats.total === 0 ? '…' : `${Math.round((stats.concluded / stats.total) * 100)}%`}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Média p/ Cliente</p>
            <p className="text-2xl font-bold text-gray-700">
              {loading || clientCount === 0 ? '…' : (stats.total / clientCount).toFixed(1)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
