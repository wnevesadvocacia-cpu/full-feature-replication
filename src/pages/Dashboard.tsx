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
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id;
        if (!uid) { setLoading(false); return; }

        // Process stats — use count queries (not page-limited)
        // Sprint E2E-fix #1+#4: filtros corrigidos para os valores reais do banco
        // ('em_andamento','concluido') e count: 'exact' (mais leve que 'exact').
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
            .in('status', ['em_andamento','aguardando']),
          supabase.from('processes').select('*', { count: 'exact', head: true })
            .in('status', ['concluido','arquivado']),
          supabase.from('processes').select('*', { count: 'exact', head: true })
            .eq('status', 'aguardando'),
          supabase.from('clients').select('*', { count: 'exact', head: true }),
          supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid)
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

        // Upcoming tasks (mesma regra da página Tarefas)
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, due_date, completed, process_id, assignee')
          .eq('user_id', uid)
          .eq('completed', false)
          .not('due_date', 'is', null)
          .not('assignee', 'eq', 'movimentacao')
          .not('assignee', 'eq', 'documento')
          .not('assignee', 'eq', 'agenda')
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

  const completionRate = stats.total > 0 ? Math.round((stats.concluded / stats.total) * 100) : 0;
  const avgPerClient = clientCount > 0 ? (stats.total / clientCount).toFixed(1) : '0';

  return (
    <div className="min-h-full bg-gradient-to-b from-background to-muted/30">
      <div className="p-8 max-w-[1400px] mx-auto space-y-8 animate-fade-in">
        {/* Editorial header */}
        <header className="flex items-end justify-between border-b border-border/60 pb-6">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.25em] text-primary/80 font-semibold">Painel Executivo</p>
            <h1 className="text-4xl font-display font-bold text-foreground tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">Visão consolidada do escritório · atualizado agora</p>
          </div>
          <Link to="/processos">
            <Button size="default" className="bg-gradient-to-r from-primary to-[hsl(var(--primary-glow))] text-primary-foreground shadow-[var(--shadow-gold)] hover:opacity-90 transition-all">
              <Plus className="h-4 w-4 mr-2" />
              Novo Processo
            </Button>
          </Link>
        </header>

        {/* KPI Bento */}
        <section className="grid grid-cols-12 gap-4">
          {/* Featured KPI — Total Processos */}
          <Card className="col-span-12 md:col-span-6 lg:col-span-5 relative overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-accent/40 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
            <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)),transparent_60%)]" />
            <CardContent className="relative p-7">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Total de Processos</span>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-6xl font-display font-bold text-foreground tracking-tight tabular-nums">
                {loading ? '…' : stats.total.toLocaleString('pt-BR')}
              </p>
              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
                  {loading ? '…' : stats.active.toLocaleString('pt-BR')} ativos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                  {loading ? '…' : stats.concluded.toLocaleString('pt-BR')} concluídos
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Secondary KPIs */}
          <Card className="col-span-6 md:col-span-3 lg:col-span-2 border-border/60 bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">Ativos</span>
              </div>
              <p className="text-3xl font-display font-bold text-foreground tabular-nums">
                {loading ? '…' : stats.active.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">em andamento</p>
            </CardContent>
          </Card>

          <Card className="col-span-6 md:col-span-3 lg:col-span-2 border-border/60 bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">Clientes</span>
              </div>
              <p className="text-3xl font-display font-bold text-foreground tabular-nums">
                {loading ? '…' : clientCount.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{avgPerClient} processos/cliente</p>
            </CardContent>
          </Card>

          <Card className="col-span-12 md:col-span-6 lg:col-span-3 border-border/60 bg-gradient-to-br from-card to-[hsl(var(--warning))]/5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 text-[hsl(var(--warning))]">
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">Tarefas Pendentes</span>
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="text-3xl font-display font-bold text-foreground tabular-nums">
                  {loading ? '…' : taskCount.toLocaleString('pt-BR')}
                </p>
                <Link to="/tarefas" className="text-[11px] text-primary hover:underline font-medium pb-1">Ver →</Link>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Two-column main */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Processes */}
          <Card className="border-border/60 bg-card shadow-[var(--shadow-card)]">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-foreground">
                <span className="flex items-center gap-2">
                  <span className="h-1 w-6 bg-primary rounded-full" />
                  <FileText className="h-4 w-4 text-primary" /> Processos Recentes
                </span>
                <Link to="/processos" className="text-xs font-medium text-primary hover:underline">Ver todos →</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <p className="text-sm text-muted-foreground p-6">Carregando…</p>
              ) : recentProcesses.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6">Nenhum processo encontrado.</p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {recentProcesses.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 px-6 py-4 hover:bg-accent/30 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate font-mono tabular-nums">{p.number || '—'}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{p.title ?? '—'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge className={`text-[10px] font-medium border-0 ${STATUS_COLORS[p.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{formatDate(p.updated_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Tasks */}
          <Card className="border-border/60 bg-card shadow-[var(--shadow-card)]">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-foreground">
                <span className="flex items-center gap-2">
                  <span className="h-1 w-6 bg-primary rounded-full" />
                  <Clock className="h-4 w-4 text-primary" /> Próximas Tarefas
                </span>
                <Link to="/tarefas" className="text-xs font-medium text-primary hover:underline">Ver todas →</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <p className="text-sm text-muted-foreground p-6">Carregando…</p>
              ) : upcomingTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6">Nenhuma tarefa pendente.</p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {upcomingTasks.map((t) => {
                    const isOverdue = t.due_date && new Date(t.due_date.slice(0,10) + 'T12:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T12:00:00');
                    const isAgenda = (t as any).assignee === 'agenda';
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-6 py-4 hover:bg-accent/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isOverdue ? 'bg-destructive/10' : 'bg-muted'}`}>
                            <CheckSquare className={`h-3.5 w-3.5 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`} />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm truncate ${isOverdue ? 'text-destructive font-semibold' : 'text-foreground'}`}>{t.title}</p>
                            {isAgenda && <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">Agenda</span>}
                          </div>
                        </div>
                        <span className={`text-xs shrink-0 tabular-nums ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                          {formatDate(t.due_date)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Editorial summary strip */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/40 rounded-lg overflow-hidden border border-border/60">
          {[
            { label: 'Concluídos', value: loading ? '…' : stats.concluded.toLocaleString('pt-BR') },
            { label: 'Aguardando', value: loading ? '…' : stats.pending.toLocaleString('pt-BR') },
            { label: 'Taxa Conclusão', value: loading ? '…' : `${completionRate}%` },
            { label: 'Média / Cliente', value: loading ? '…' : avgPerClient },
          ].map((item) => (
            <div key={item.label} className="bg-card p-5 hover:bg-accent/30 transition-colors">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-2">{item.label}</p>
              <p className="text-2xl font-display font-bold text-foreground tabular-nums">{item.value}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
