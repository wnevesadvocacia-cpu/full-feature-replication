import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, TrendingDown, Wallet, Receipt as ReceiptIcon } from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';

const CATEGORIES = ['custas', 'transporte', 'salarios', 'aluguel', 'software', 'marketing', 'escritorio', 'geral'];
const PAYMENT_METHODS = ['dinheiro', 'pix', 'boleto', 'cartao_credito', 'cartao_debito', 'transferencia'];

export default function Despesas() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    description: '', category: 'geral', amount: '', date: new Date().toISOString().slice(0, 10),
    payment_method: 'pix', supplier: '', reimbursable: false, notes: '',
  });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('expenses').insert({
        user_id: user!.id,
        description: form.description,
        category: form.category,
        amount: parseFloat(form.amount) || 0,
        date: form.date,
        payment_method: form.payment_method,
        supplier: form.supplier || null,
        reimbursable: form.reimbursable,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      setOpen(false);
      setForm({ description: '', category: 'geral', amount: '', date: new Date().toISOString().slice(0, 10), payment_method: 'pix', supplier: '', reimbursable: false, notes: '' });
      toast({ title: 'Despesa registrada!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: 'Despesa removida.' });
    },
  });

  const stats = useMemo(() => {
    const total = expenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const thisMonth = expenses.filter((e: any) => {
      const d = new Date(e.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const reimbursable = expenses.filter((e: any) => e.reimbursable && !e.reimbursed).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    return { total, thisMonth, reimbursable };
  }, [expenses]);

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Despesas</h1>
          <p className="text-muted-foreground text-sm mt-1">Registre custos e despesas operacionais.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" />Nova despesa</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nova despesa</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Descrição *</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria</Label>
                  <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm h-10" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Forma de pagamento</Label>
                  <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm h-10" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                    {PAYMENT_METHODS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.reimbursable} onChange={(e) => setForm({ ...form, reimbursable: e.target.checked })} />
                Despesa reembolsável (cliente)
              </label>
              <Button className="w-full" onClick={() => create.mutate()} disabled={!form.description || !form.amount || create.isPending}>
                {create.isPending ? 'Salvando…' : 'Registrar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Total geral" value={fmt(stats.total)} icon={Wallet} />
        <MetricCard title="Este mês" value={fmt(stats.thisMonth)} icon={TrendingDown} />
        <MetricCard title="Reembolsáveis pendentes" value={fmt(stats.reimbursable)} icon={ReceiptIcon} />
      </div>

      <div className="bg-card rounded-lg shadow-card overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground text-center">Carregando…</p>
        ) : expenses.length === 0 ? (
          <p className="p-8 text-sm text-muted-foreground text-center">Nenhuma despesa registrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Descrição</th>
                <th className="px-4 py-2">Categoria</th>
                <th className="px-4 py-2 text-right">Valor</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {expenses.map((e: any) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 text-muted-foreground">{new Date(e.date).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{e.description}</div>
                    {e.supplier && <div className="text-xs text-muted-foreground">{e.supplier}</div>}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline">{e.category}</Badge>
                    {e.reimbursable && <Badge className="ml-1" variant="secondary">reembolsável</Badge>}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(Number(e.amount))}</td>
                  <td className="px-4 py-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => remove.mutate(e.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
