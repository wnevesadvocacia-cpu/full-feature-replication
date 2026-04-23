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
  AlertCircle, Scale, Calendar, Printer,
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
        .not('assignee', 'eq', 'documento')
        .not('assignee', 'eq', 'agenda').limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useFinancialStats() {
  return useQuery({
    queryKey: ['report-financial'],
    queryFn: async () => {
      const [inv, exp, proc, cli] = await Promise.all([
        supabase.from('invoices').select('amount, status, paid_date, client_id, created_at').limit(5000),
        supabase.from('expenses').select('amount, date, client_id, process_id, reimbursable, reimbursed').limit(5000),
        supabase.from('processes').select('id, client_id, type, status, result, honorarios_valor, value').limit(5000),
        supabase.from('clients').select('id, name').limit(5000),
      ]);
      return {
        invoices: inv.data ?? [],
        expenses: exp.data ?? [],
        processes: proc.data ?? [],
        clients: cli.data ?? [],
      };
    },
  });
}

const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

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
  const fin = useFinancialStats();

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
    const due = new Date(t.due_date + 'T00:00:00'); const today = new Date(); today.setHours(0,0,0,0); return due < today;
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
    name: d.name === 'PF' ? 'Pessoa Física' :
          d.name === 'PJ' ? 'Pessoa Jurídica' : d.name,
    value: d.value,
  }));

  // ── Task priority chart ──
  const taskPriorityData = groupCount(
    tks.filter(t => !t.completed).map(t => t.priority)
  ).map(d => ({
    name: d.name === 'alta' ? 'Alta' : d.name === 'media' ? 'Média' :
          d.name === 'baixa' ? 'Baixa' : d.name ?? 'Sem prioridade',
    value: d.value,
  }));

  // ── Lawyer distribution ──
  const lawyerData = groupCount(
    procs.map(p => p.lawyer ?? 'Não atribuído')
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileBarChart className="h-7 w-7" />
            Relatórios
          </h1>
          <p className="text-muted-foreground mt-1">
            Visão geral e estatísticas do escritório
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors print:hidden"
        >
          <Printer className="h-4 w-4" /> Imprimir / Exportar PDF
        </button>
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

      {/* ── BI Avançado ──────────────────────────────────── */}
      <BiAvancado fin={fin.data} loading={fin.isLoading} />
    </div>
  );
}

// ── BI Avançado ───────────────────────────────────────────────────────────────
type FinData = {
  invoices: { amount: number; status: string; paid_date: string | null; client_id: string | null; created_at: string }[];
  expenses: { amount: number; date: string; client_id: string | null; process_id: string | null; reimbursable: boolean; reimbursed: boolean }[];
  processes: { id: string; client_id: string | null; type: string | null; status: string; result: string | null; honorarios_valor: number | null; value: number | null }[];
  clients: { id: string; name: string }[];
};

function BiAvancado({ fin, loading }: { fin: FinData | undefined; loading: boolean }) {
  if (loading) {
    return (
      <Card><CardContent className="pt-6 flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </CardContent></Card>
    );
  }
  if (!fin) return null;

  const { invoices, expenses, processes: procs, clients: cls } = fin;
  const clientName = (id: string | null) => cls.find(c => c.id === id)?.name ?? '—';

  // Receita realizada (faturas pagas)
  const receitaPaga = invoices.filter(i => i.status === 'pago' || i.status === 'paga').reduce((s, i) => s + Number(i.amount || 0), 0);
  const receitaPendente = invoices.filter(i => i.status === 'pendente').reduce((s, i) => s + Number(i.amount || 0), 0);
  const despesasTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const lucroLiquido = receitaPaga - despesasTotal;

  // Taxa de sucesso por área (tipo de processo)
  const concluidos = procs.filter(p => ['concluido', 'closed', 'arquivado'].includes(p.status));
  const successByType: Record<string, { ganhos: number; total: number }> = {};
  for (const p of concluidos) {
    const t = p.type ?? 'Não informado';
    if (!successByType[t]) successByType[t] = { ganhos: 0, total: 0 };
    successByType[t].total++;
    if (p.result && /(ganho|procedente|favorável|exito|êxito|vitoria|vitória)/i.test(p.result)) {
      successByType[t].ganhos++;
    }
  }
  const successData = Object.entries(successByType)
    .filter(([, v]) => v.total > 0)
    .map(([name, v]) => ({ name, taxa: Math.round((v.ganhos / v.total) * 100), total: v.total }))
    .sort((a, b) => b.taxa - a.taxa)
    .slice(0, 8);

  // ROI por cliente (receita - despesas reembolsáveis não-reembolsadas)
  const roiByClient: Record<string, { receita: number; despesa: number }> = {};
  for (const i of invoices) {
    if (!i.client_id) continue;
    const paga = i.status === 'pago' || i.status === 'paga';
    if (!paga) continue;
    if (!roiByClient[i.client_id]) roiByClient[i.client_id] = { receita: 0, despesa: 0 };
    roiByClient[i.client_id].receita += Number(i.amount || 0);
  }
  for (const e of expenses) {
    if (!e.client_id) continue;
    if (!roiByClient[e.client_id]) roiByClient[e.client_id] = { receita: 0, despesa: 0 };
    roiByClient[e.client_id].despesa += Number(e.amount || 0);
  }
  const roiData = Object.entries(roiByClient)
    .map(([id, v]) => ({
      name: clientName(id),
      receita: v.receita,
      despesa: v.despesa,
      roi: v.receita - v.despesa,
    }))
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 10);

  // Receita mensal (últimos 12 meses)
  const now = new Date();
  const monthly: Record<string, { receita: number; despesa: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthly[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = { receita: 0, despesa: 0 };
  }
  for (const inv of invoices) {
    if (!(inv.status === 'pago' || inv.status === 'paga') || !inv.paid_date) continue;
    const d = new Date(inv.paid_date + 'T00:00:00');
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (k in monthly) monthly[k].receita += Number(inv.amount || 0);
  }
  for (const e of expenses) {
    const d = new Date(e.date + 'T00:00:00');
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (k in monthly) monthly[k].despesa += Number(e.amount || 0);
  }
  const monthlyFin = Object.entries(monthly).map(([k, v]) => ({
    name: MONTHS_PT[parseInt(k.split('-')[1]) - 1],
    Receita: Math.round(v.receita),
    Despesa: Math.round(v.despesa),
  }));

  return (
    <div className="space-y-6 pt-2">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">BI Avançado — Performance &amp; Financeiro</h2>
      </div>

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Receita Recebida" value={fmtBRL(receitaPaga)} icon={TrendingUp} color="bg-emerald-500" />
        <KpiCard title="Receita Pendente" value={fmtBRL(receitaPendente)} icon={Clock} color="bg-amber-500" />
        <KpiCard title="Despesas Totais" value={fmtBRL(despesasTotal)} icon={AlertCircle} color="bg-red-500" />
        <KpiCard
          title="Lucro Líquido"
          value={fmtBRL(lucroLiquido)}
          icon={TrendingUp}
          color={lucroLiquido >= 0 ? 'bg-green-600' : 'bg-rose-600'}
        />
      </div>

      {/* Receita vs Despesa mensal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receita vs Despesa — Últimos 12 Meses</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyFin} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Legend />
              <Bar dataKey="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Taxa de sucesso por área */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Taxa de Sucesso por Área
            </CardTitle>
          </CardHeader>
          <CardContent>
            {successData.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Sem processos concluídos com resultado registrado
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {successData.map((d, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="truncate max-w-[220px]" title={d.name}>{d.name}</span>
                      <span className="font-medium shrink-0 ml-2">
                        {d.taxa}% <span className="text-xs text-muted-foreground">({d.total})</span>
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${d.taxa >= 70 ? 'bg-emerald-500' : d.taxa >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${d.taxa}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ROI por cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Top 10 Clientes por ROI
            </CardTitle>
          </CardHeader>
          <CardContent>
            {roiData.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Sem dados financeiros por cliente
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 px-2 font-medium">Cliente</th>
                      <th className="text-right py-2 px-2 font-medium">Receita</th>
                      <th className="text-right py-2 px-2 font-medium">Despesa</th>
                      <th className="text-right py-2 px-2 font-medium">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roiData.map((d, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 px-2 truncate max-w-[140px]" title={d.name}>{d.name}</td>
                        <td className="py-2 px-2 text-right text-emerald-600">{fmtBRL(d.receita)}</td>
                        <td className="py-2 px-2 text-right text-red-600">{fmtBRL(d.despesa)}</td>
                        <td className={`py-2 px-2 text-right font-semibold ${d.roi >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {fmtBRL(d.roi)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
