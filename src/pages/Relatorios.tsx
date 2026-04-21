import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BarChart3, TrendingUp, Users, Briefcase, DollarSign, Download, Loader2, Scale } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTasks } from '@/hooks/useTasks';
import { useInvoices } from '@/hooks/useInvoices';

const STATUS_LABELS: Record<string, string> = { novo: 'Novo', em_andamento: 'Em Andamento', ativo: 'Ativo', aguardando: 'Aguardando', concluido: 'Concluído', arquivado: 'Arquivado', recursal: 'Recursal', sobrestamento: 'Sobrestamento' };
const STATUS_COLORS: Record<string, string> = { novo: '#3B82F6', em_andamento: '#22C55E', ativo: '#22C55E', aguardando: '#F59E0B', concluido: '#6B7280', arquivado: '#9CA3AF', recursal: '#8B5CF6', sobrestamento: '#F97316' };

function useAllProcessStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['all-process-stats'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('processes').select('status,type,comarca,responsible,lawyer,created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useClientStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['client-stats-report'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('status,type,created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function countBy<T>(arr: T[], key: keyof T): Record<string, number> {
  return arr.reduce((acc, item) => { const k = String(item[key] ?? 'N/A'); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {} as Record<string, number>);
}

function topN(obj: Record<string, number>, n = 8) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function MiniBar({ label, value, max, color = '#3B82F6' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-36 truncate text-gray-600 text-xs flex-shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-right text-xs font-medium text-gray-700">{value}</span>
    </div>
  );
}

export default function Relatorios() {
  const { data: processes = [], isLoading: lp } = useAllProcessStats();
  const { data: clients = [], isLoading: lc } = useClientStats();
  const { data: tasks = [], isLoading: lt } = useTasks();
  const { data: invoices = [], isLoading: li } = useInvoices();
  if (lp || lc || lt || li) return <div className="p-6 flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  const proc = processes as any[], cli = clients as any[], tsk = tasks as any[], inv = invoices as any[];
  const statusDist = countBy(proc, 'status');
  const typeDist = topN(countBy(proc, 'type'), 10);
  const comarcaDist = topN(countBy(proc, 'comarca'), 8);
  const respDist = topN(countBy(proc.map((p: any) => ({ ...p, resp: p.responsible || p.lawyer || 'N/A' })), 'resp'), 8);
  const activeProc = proc.filter((p: any) => !['concluido','arquivado'].includes(p.status ?? '')).length;
  const activeClients = cli.filter((c: any) => c.status === 'ativo').length;
  const pfClients = cli.filter((c: any) => c.type === 'PF').length;
  const pjClients = cli.filter((c: any) => c.type === 'PJ').length;
  const pendingTasks = tsk.filter((t: any) => !t.completed).length;
  const completedTasks = tsk.filter((t: any) => t.completed).length;
  const totalBilled = inv.filter((i: any) => i.status === 'pago').reduce((s: number, i: any) => s + Number(i.amount), 0);
  const totalPending = inv.filter((i: any) => i.status === 'pendente').reduce((s: number, i: any) => s + Number(i.amount), 0);
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Relatórios</h1><p className="text-sm text-gray-500">Análise completa do escritório</p></div>
        <Button variant="outline" onClick={() => window.print()}><Download className="w-4 h-4 mr-2" /> Exportar</Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Processos', value: proc.length.toLocaleString('pt-BR'), sub: `${activeProc} ativos`, icon: Scale, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Clientes', value: cli.length.toLocaleString('pt-BR'), sub: `${activeClients} ativos`, icon: Users, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Tarefas Concluídas', value: completedTasks.toLocaleString('pt-BR'), sub: `${pendingTasks} pendentes`, icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Faturamento', value: fmt(totalBilled), sub: `${fmt(totalPending)} pendente`, icon: DollarSign, color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-gray-500 font-medium">{label}</p><p className="text-2xl font-bold text-gray-900 mt-1">{value}</p><p className="text-xs text-gray-400 mt-1">{sub}</p></div>
              <div className={`p-2 rounded-lg ${bg}`}><Icon className={`w-5 h-5 ${color}`} /></div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" />Processos por Status</h3>
          <div className="space-y-3">{Object.entries(statusDist).sort((a, b) => b[1] - a[1]).map(([s, c]) => <MiniBar key={s} label={STATUS_LABELS[s] ?? s} value={c} max={proc.length} color={STATUS_COLORS[s] ?? '#6B7280'} />)}</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Briefcase className="w-4 h-4 text-purple-500" />Tipos de Ação (Top 10)</h3>
          <div className="space-y-3">{typeDist.map(([t, c]) => <MiniBar key={t} label={t} value={c} max={typeDist[0]?.[1] ?? 1} color="#8B5CF6" />)}</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Scale className="w-4 h-4 text-green-500" />Por Comarca (Top 8)</h3>
          <div className="space-y-3">{comarcaDist.length > 0 ? comarcaDist.map(([c, n]) => <MiniBar key={c} label={c} value={n} max={comarcaDist[0]?.[1] ?? 1} color="#22C55E" />) : <p className="text-sm text-gray-400 text-center py-4">Dados não disponíveis</p>}</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-orange-500" />Por Responsável</h3>
          <div className="space-y-3">{respDist.map(([r, n]) => <MiniBar key={r} label={r} value={n} max={respDist[0]?.[1] ?? 1} color="#F97316" />)}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Clientes por Tipo</h3>
          <div className="space-y-3"><MiniBar label="Pessoa Física (PF)" value={pfClients} max={cli.length || 1} color="#3B82F6" /><MiniBar label="Pessoa Jurídica (PJ)" value={pjClients} max={cli.length || 1} color="#8B5CF6" /></div>
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t text-center">{cli.length} clientes · {activeClients} ativos</p>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Tarefas</h3>
          <div className="space-y-3"><MiniBar label="Concluídas" value={completedTasks} max={tsk.length || 1} color="#22C55E" /><MiniBar label="Pendentes" value={pendingTasks} max={tsk.length || 1} color="#F59E0B" /></div>
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t text-center">Taxa: {tsk.length > 0 ? Math.round((completedTasks/tsk.length)*100) : 0}%</p>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Financeiro</h3>
          <div className="space-y-3">
            {[{label:'Pago',v:inv.filter((i:any)=>i.status==='pago').length,c:'#22C55E'},{label:'Pendente',v:inv.filter((i:any)=>i.status==='pendente').length,c:'#F59E0B'},{label:'Atrasado',v:inv.filter((i:any)=>i.status==='atrasado').length,c:'#EF4444'}].map(({label,v,c})=><MiniBar key={label} label={label} value={v} max={Math.max(inv.length,1)} color={c}/>)}
          </div>
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t text-center">{fmt(totalBilled)} recebido</p>
        </div>
      </div>
    </div>
  );
}
