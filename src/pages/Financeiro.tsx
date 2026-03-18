import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Download,
} from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type InvoiceStatus = 'pago' | 'pendente' | 'atrasado' | 'cancelado';

interface Invoice {
  id: string;
  number: string;
  client: string;
  description: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: string;
  paidDate?: string;
}

const statusConfig: Record<InvoiceStatus, { label: string; className: string }> = {
  pago: { label: 'Pago', className: 'bg-success/10 text-success border-success/20' },
  pendente: { label: 'Pendente', className: 'bg-warning/10 text-warning border-warning/20' },
  atrasado: { label: 'Atrasado', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  cancelado: { label: 'Cancelado', className: 'bg-muted text-muted-foreground border-border' },
};

const cashFlowData = [
  { month: 'Jan', receitas: 65000, despesas: 28000 },
  { month: 'Fev', receitas: 72000, despesas: 31000 },
  { month: 'Mar', receitas: 58000, despesas: 26000 },
  { month: 'Abr', receitas: 81000, despesas: 35000 },
  { month: 'Mai', receitas: 75000, despesas: 29000 },
  { month: 'Jun', receitas: 92000, despesas: 38000 },
  { month: 'Jul', receitas: 88000, despesas: 33000 },
];

const mockInvoices: Invoice[] = [
  { id: '1', number: 'FAT-2024-001', client: 'João Silva', description: 'Honorários - Reclamação Trabalhista', amount: 15000, status: 'pago', dueDate: '2024-02-15', paidDate: '2024-02-14' },
  { id: '2', number: 'FAT-2024-002', client: 'Maria Santos', description: 'Honorários - Ação de Indenização', amount: 25000, status: 'pendente', dueDate: '2024-03-15' },
  { id: '3', number: 'FAT-2024-003', client: 'Tech Corp LTDA', description: 'Consultoria Tributária', amount: 8000, status: 'pago', dueDate: '2024-02-28', paidDate: '2024-02-27' },
  { id: '4', number: 'FAT-2024-004', client: 'Ana Oliveira', description: 'Honorários - Divórcio', amount: 5200, status: 'atrasado', dueDate: '2024-02-20' },
  { id: '5', number: 'FAT-2024-005', client: 'Comércio ABC', description: 'Defesa Fiscal', amount: 18000, status: 'pendente', dueDate: '2024-03-20' },
  { id: '6', number: 'FAT-2024-006', client: 'Roberto Lima', description: 'Honorários - Revisão Contratual', amount: 7500, status: 'pago', dueDate: '2024-03-01', paidDate: '2024-02-28' },
  { id: '7', number: 'FAT-2024-007', client: 'Fernanda Costa', description: 'Honorários - Rescisão Indireta', amount: 12000, status: 'cancelado', dueDate: '2024-03-05' },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function Financeiro() {
  const [search, setSearch] = useState('');

  const filtered = mockInvoices.filter(
    (i) =>
      i.client.toLowerCase().includes(search.toLowerCase()) ||
      i.number.toLowerCase().includes(search.toLowerCase())
  );

  const totalReceived = mockInvoices.filter((i) => i.status === 'pago').reduce((sum, i) => sum + i.amount, 0);
  const totalPending = mockInvoices.filter((i) => i.status === 'pendente').reduce((sum, i) => sum + i.amount, 0);
  const totalOverdue = mockInvoices.filter((i) => i.status === 'atrasado').reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Financeiro</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de honorários e faturamento</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          <Button>
            <Plus className="h-4 w-4" />
            Nova Fatura
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Recebido" value={formatCurrency(totalReceived)} change="+12.5%" changeType="positive" icon={TrendingUp} description="vs. mês anterior" />
        <MetricCard title="A Receber" value={formatCurrency(totalPending)} icon={Clock} description="faturas pendentes" />
        <MetricCard title="Em Atraso" value={formatCurrency(totalOverdue)} change="1 fatura" changeType="negative" icon={TrendingDown} />
      </div>

      {/* Cash flow chart */}
      <div className="bg-card rounded-lg p-5 shadow-card">
        <h3 className="font-display font-semibold mb-4">Fluxo de Caixa</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={cashFlowData}>
            <defs>
              <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(215, 20%, 65%)" />
            <YAxis tick={{ fontSize: 12 }} stroke="hsl(215, 20%, 65%)" tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip
              formatter={(value: number, name: string) => [formatCurrency(value), name === 'receitas' ? 'Receitas' : 'Despesas']}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.1)', fontSize: '13px' }}
            />
            <Area type="monotone" dataKey="receitas" stroke="hsl(142, 76%, 36%)" strokeWidth={2} fillOpacity={1} fill="url(#colorReceitas)" />
            <Area type="monotone" dataKey="despesas" stroke="hsl(0, 84%, 60%)" strokeWidth={2} fillOpacity={1} fill="url(#colorDespesas)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Invoices table */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar fatura..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4" />
            Filtros
          </Button>
        </div>

        <div className="bg-card rounded-lg shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nº Fatura</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Descrição</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Valor</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Vencimento</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((invoice) => (
                <tr key={invoice.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors duration-150 cursor-pointer">
                  <td className="py-2 px-4 font-mono text-muted-foreground">{invoice.number}</td>
                  <td className="py-2 px-4 font-medium">{invoice.client}</td>
                  <td className="py-2 px-4 text-muted-foreground">{invoice.description}</td>
                  <td className="py-2 px-4 text-right font-semibold tabular-nums">{formatCurrency(invoice.amount)}</td>
                  <td className="py-2 px-4">
                    <Badge variant="outline" className={`text-xs ${statusConfig[invoice.status].className}`}>
                      {statusConfig[invoice.status].label}
                    </Badge>
                  </td>
                  <td className="py-2 px-4 tabular-nums">{new Date(invoice.dueDate).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
