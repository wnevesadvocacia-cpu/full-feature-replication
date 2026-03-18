import { MetricCard } from '@/components/MetricCard';
import {
  Briefcase,
  CheckSquare,
  DollarSign,
  Users,
  TrendingUp,
  Clock,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const revenueData = [
  { month: 'Jan', valor: 45000 },
  { month: 'Fev', valor: 52000 },
  { month: 'Mar', valor: 48000 },
  { month: 'Abr', valor: 61000 },
  { month: 'Mai', valor: 55000 },
  { month: 'Jun', valor: 67000 },
  { month: 'Jul', valor: 72000 },
];

const taskData = [
  { name: 'Seg', concluídas: 12, pendentes: 3 },
  { name: 'Ter', concluídas: 8, pendentes: 5 },
  { name: 'Qua', concluídas: 15, pendentes: 2 },
  { name: 'Qui', concluídas: 10, pendentes: 4 },
  { name: 'Sex', concluídas: 14, pendentes: 1 },
];

const caseTypes = [
  { name: 'Trabalhista', value: 35, color: 'hsl(221, 83%, 53%)' },
  { name: 'Cível', value: 28, color: 'hsl(142, 76%, 36%)' },
  { name: 'Tributário', value: 20, color: 'hsl(38, 92%, 50%)' },
  { name: 'Criminal', value: 12, color: 'hsl(0, 84%, 60%)' },
  { name: 'Outros', value: 5, color: 'hsl(215, 20%, 65%)' },
];

const recentActivities = [
  { id: 1, action: 'Petição inicial protocolada', case: 'Processo #2024-1847', time: '2 min atrás', type: 'success' },
  { id: 2, action: 'Prazo vencendo amanhã', case: 'Processo #2024-1523', time: '15 min atrás', type: 'warning' },
  { id: 3, action: 'Novo cliente cadastrado', case: 'Maria Silva', time: '1h atrás', type: 'info' },
  { id: 4, action: 'Audiência agendada', case: 'Processo #2024-1201', time: '2h atrás', type: 'info' },
  { id: 5, action: 'Pagamento recebido', case: 'R$ 5.200,00', time: '3h atrás', type: 'success' },
];

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral do seu escritório</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Processos Ativos"
          value={247}
          change="+12%"
          changeType="positive"
          icon={Briefcase}
          description="vs. mês anterior"
        />
        <MetricCard
          title="Tarefas Pendentes"
          value={38}
          change="-5"
          changeType="positive"
          icon={CheckSquare}
          description="vs. semana anterior"
        />
        <MetricCard
          title="Faturamento Mensal"
          value="R$ 72.400"
          change="+8.2%"
          changeType="positive"
          icon={DollarSign}
          description="vs. mês anterior"
        />
        <MetricCard
          title="Clientes Ativos"
          value={184}
          change="+3"
          changeType="positive"
          icon={Users}
          description="novos este mês"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-card rounded-lg p-5 shadow-card">
          <h3 className="font-display font-semibold mb-4">Faturamento</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(215, 20%, 65%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(215, 20%, 65%)" tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip
                formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Faturamento']}
                contentStyle={{
                  borderRadius: '8px',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,.1)',
                  fontSize: '13px',
                }}
              />
              <Area
                type="monotone"
                dataKey="valor"
                stroke="hsl(221, 83%, 53%)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Case Types Pie */}
        <div className="bg-card rounded-lg p-5 shadow-card">
          <h3 className="font-display font-semibold mb-4">Tipos de Processo</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={caseTypes} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                {caseTypes.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [`${value}%`, name]}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.1)', fontSize: '13px' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {caseTypes.map((type) => (
              <div key={type.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: type.color }} />
                  <span className="text-muted-foreground">{type.name}</span>
                </div>
                <span className="font-medium tabular-nums">{type.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tasks chart */}
        <div className="bg-card rounded-lg p-5 shadow-card">
          <h3 className="font-display font-semibold mb-4">Tarefas da Semana</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={taskData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(215, 20%, 65%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(215, 20%, 65%)" />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.1)', fontSize: '13px' }} />
              <Bar dataKey="concluídas" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pendentes" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent activity */}
        <div className="bg-card rounded-lg p-5 shadow-card">
          <h3 className="font-display font-semibold mb-4">Atividade Recente</h3>
          <div className="space-y-3">
            {recentActivities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-md hover:bg-muted/50 transition-colors duration-150"
              >
                <div
                  className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                    activity.type === 'success'
                      ? 'bg-success'
                      : activity.type === 'warning'
                      ? 'bg-warning'
                      : 'bg-info'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{activity.action}</p>
                  <p className="text-xs text-muted-foreground">{activity.case}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
