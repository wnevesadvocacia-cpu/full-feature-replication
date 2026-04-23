import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MetricCard } from '@/components/MetricCard';
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react';

export default function FluxoCaixa() {
  const { user } = useAuth();

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices-cash'],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('amount, status, paid_date, due_date, created_at');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses-cash'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('amount, date, category');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const stats = useMemo(() => {
    const now = new Date();
    const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const monthlyIn: Record<string, number> = {};
    const monthlyOut: Record<string, number> = {};

    invoices.forEach((i: any) => {
      const d = i.paid_date ? new Date(i.paid_date) : new Date(i.created_at);
      const k = ym(d);
      if (i.status === 'paga') monthlyIn[k] = (monthlyIn[k] || 0) + Number(i.amount || 0);
    });

    expenses.forEach((e: any) => {
      const k = ym(new Date(e.date));
      monthlyOut[k] = (monthlyOut[k] || 0) + Number(e.amount || 0);
    });

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return ym(d);
    });

    const series = months.map((m) => ({
      month: m,
      label: new Date(m + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      in: monthlyIn[m] || 0,
      out: monthlyOut[m] || 0,
      net: (monthlyIn[m] || 0) - (monthlyOut[m] || 0),
    }));

    const totalIn = series.reduce((s, x) => s + x.in, 0);
    const totalOut = series.reduce((s, x) => s + x.out, 0);
    const totalNet = totalIn - totalOut;

    const max = Math.max(...series.flatMap((s) => [s.in, s.out]), 1);
    return { series, totalIn, totalOut, totalNet, max };
  }, [invoices, expenses]);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold">Fluxo de Caixa</h1>
        <p className="text-muted-foreground text-sm mt-1">Entradas, saídas e resultado dos últimos 6 meses.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Entradas (6m)" value={fmt(stats.totalIn)} icon={TrendingUp} />
        <MetricCard title="Saídas (6m)" value={fmt(stats.totalOut)} icon={TrendingDown} />
        <MetricCard title="Resultado" value={fmt(stats.totalNet)} icon={DollarSign} />
        <MetricCard title="Margem" value={stats.totalIn ? `${Math.round((stats.totalNet / stats.totalIn) * 100)}%` : '—'} icon={BarChart3} />
      </div>

      <div className="bg-card rounded-lg shadow-card p-6">
        <h2 className="font-semibold mb-4">Últimos 6 meses</h2>
        <div className="space-y-4">
          {stats.series.map((s) => (
            <div key={s.month} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium capitalize">{s.label}</span>
                <span className={s.net >= 0 ? 'text-green-600' : 'text-red-500'}>{fmt(s.net)}</span>
              </div>
              <div className="flex gap-1 h-6">
                <div className="bg-green-500/80 rounded-l" style={{ width: `${(s.in / stats.max) * 50}%` }} title={`Entradas: ${fmt(s.in)}`} />
                <div className="bg-red-500/80 rounded-r" style={{ width: `${(s.out / stats.max) * 50}%` }} title={`Saídas: ${fmt(s.out)}`} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>↑ {fmt(s.in)}</span>
                <span>↓ {fmt(s.out)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
