import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileBarChart, Users, CheckCircle2, Clock, TrendingUp,
  AlertCircle, Scale, Calendar,
} from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo', em_andamento: 'Em Andamento', aguardando: 'Aguardando',
  concluido: 'Concluído', ativo: 'Ativo', arquivado: 'Arquivado',
  recursal: 'Recursal', sobrestamento: 'Sobrestamento',
  active: 'Ativo', archived: 'Arquivado', pending: 'Aguardando', closed: 'Concluído',
};

const STATUS_COLORS: Record<string, string> = {
  novo: '#6366f1', em_andamento: '#3b82f6', aguardando: '#f59e0b',
  concluido: '#10b981', ativo: '#22c55e', arquivado: '#64748b',
  recursal: '#8b5cf6', sobrestamento: '#f97316',
  active: '#22c55e', archived: '#64748b', pending: '#f59e0b', closed: '#10b981',
};

const CHART_COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#f97316', '#06b6d4',
];

function groupCount(arr: string[]): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  for (const v of arr) { counts[v] = (counts[v] ?? 0) + 1; }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ── hooks ──────────────────────────────────────────────────────────────────────
function useProcessStats() {
  return useQuery({
    queryKey: ['report-processes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select('status, type, created_at, lawyer').limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useClientStats() {
  return useQuery({
    queryKey: ['report-clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('type, status, created_at').limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useTaskStats() {
  return useQuery({
    queryKey: ['report-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('status, priority, completed, due_date')
        .not('assignee', 'eq', 'movimentacao')
        .not('assignee', 'eq', 'documento').limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({
  title, value, sub, icon: Icon, color,
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-3 rounded-lg ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Relatorios() {
  const processes = useProcessStats();
  const clients = useClientStats();
  const tasks = useTaskStats();

  const procs = processes.data ?? [];
  const cls = clients.data ?? [];
  const tks = tasks.data ?? [];

  // ── KPIs ──
  const total = procs.length;
  const active = procs.filter(p =>
    !['concluido', 'arquivado', 'closed', 'archived'].includes(p.status)
  ).length;
  const concluded = procs.filter(p =>
    ['concluido', 'closed'].includes(p.status)
  ).length;
  const conclusionRate = total > 0 ? ((concluded / total) * 100).toFixed(1) : '0';
  const pendingTasks = tks.filter(t => !t.completed).length;
  const overdueTasks = tks.filter(t => {
    if (t.completed || !t.due_date) return false;
    return new Date(t.due_date) < new Date();
  }).length;

  // ── Status chart ──
  const statusData = groupCount(procs.map(p => p.status)).map(d => ({
    name: STATUS_LABELS[d.name] ?? d.name,
    value: d.value,
    fill: STATUS_COLORS[d.name] ?? '#64748b',
  }));

  // ── Type chart ──
  const typeData = groupCount(
    procs.map(p => p.type ?? 'Não informado')
  ).slice(0, 8);

  // ── Monthly trend (last 12 months) ──
  const now = new Date();
  const monthlyMap: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyMap[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0;
  }
  for (const p of procs) {
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in monthlyMap) monthlyMap[key]++;
  }
  const monthlyData = Object.entries(monthlyMap).map(([k, v]) => ({
    name: MONTHS_PT[parseInt(k.split('-')[1]) - 1],
    processos: v,
  }));

  // ── Client type chart ──
  const clientTypeData = groupCount(cls.map(c => c.type)).map(d => ({
    name: d.name === 'individual' ? 'Pessoa Física' :
          d.name === 'company' ? 'Pessoa Jurídica' : d.name,
    value: d.value,
  }));

  // ── Task priority chart ──
  const taskPriorityData = groupCount(
    tks.filter(t => !t.completed).map(t => t.priority)
  ).map(d => ({
    name: d.name === 'high' ? 'Alta' : d.name === 'medium' ? 'Média' :
          d.name === 'low' ? 'Baixa' : d.name,
    value: d.value,
  }));

  // ── Lawyer distribution ──
  const lawyerData = groupCount(
    procs.map(p => (p as any).lawyer ?? p.lawyer ?? 'Não atribuído')
  ).slice(0, 6);

  const isLoading = processes.isLoading || clients.isLoading || tasks.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileBarChart className="h-7 w-7" />
          Relatórios
        </h1>
        <p className="text-muted-foreground mt-1">
          Visão geral e estatísticas do escritório
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard title="Total Processos" value={total} icon={Scale} color="bg-blue-500" />
        <KpiCard title="Ativos" value={active} icon={TrendingUp} color="bg-green-500" />
        <KpiCard title="Concluídos" value={concluded} icon={CheckCircle2} color="bg-emerald-500" />
        <KpiCard title="Taxa Conclusão" value={`${conclusionRate}%`} icon={TrendingUp} color="bg-indigo-500" />
        <KpiCard title="Tarefas Pendentes" value={pendingTasks} icon={Clock} color="bg-amber-500" />
        <KpiCard title="Clientes" value={cls.length} icon={Users} color="bg-purple-500" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Processos por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={statusData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" name="Processos" radius={[4, 4, 0, 0]}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Processos Abertos – Últimos 12 Meses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="processos" name="Processos" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Type distribution */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Processos por Tipo (Top 8)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={typeData} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="value" name="Processos" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                  {typeData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Client types pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clientes por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={clientTypeData}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {clientTypeData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task priorities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Tarefas Pendentes por Prioridade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {taskPriorityData.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Nenhuma tarefa pendente
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {taskPriorityData.map((d, i) => {
                  const pct = pendingTasks > 0 ? (d.value / pendingTasks) * 100 : 0;
                  const color = d.name === 'Alta' ? 'bg-red-500' :
                                d.name === 'Média' ? 'bg-amber-500' : 'bg-green-500';
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{d.name}</span>
                        <span className="font-medium">{d.value}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {overdueTasks > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800">
                    <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {overdueTasks} tarefa{overdueTasks !== 1 ? 's' : ''} atrasada{overdueTasks !== 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lawyer distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Processos por Advogado (Top 6)</CardTitle>
          </CardHeader>
          <CardContent>
            {lawyerData.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Sem dados de advogados
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {lawyerData.map((d, i) => {
                  const pct = total > 0 ? (d.value / total) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="truncate max-w-[200px]" title={d.name}>{d.name}</span>
                        <span className="font-medium shrink-0 ml-2">{d.value}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-indigo-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo por Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Processos</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">% do Total</th>
                </tr>
              </thead>
              <tbody>
                {statusData.map((s, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: s.fill }} />
                        {s.name}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-medium">{s.value}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {total > 0 ? ((s.value / total) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold bg-muted/30">
                  <td className="py-2 px-3">Total</td>
                  <td className="py-2 px-3 text-right">{total}</td>
                  <td className="py-2 px-3 text-right">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
