import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Filter, TrendingUp, TrendingDown, Clock, Download, Loader2 } from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';
import { useInvoices, useCreateInvoice } from '@/hooks/useInvoices';
import { useClients } from '@/hooks/useClients';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type InvoiceStatus = 'pago' | 'pendente' | 'atrasado' | 'cancelado';

const statusConfig: Record<InvoiceStatus, { label: string; className: string }> = {
  pago: { label: 'Pago', className: 'bg-success/10 text-success border-success/20' },
  pendente: { label: 'Pendente', className: 'bg-warning/10 text-warning border-warning/20' },
  atrasado: { label: 'Atrasado', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  cancelado: { label: 'Cancelado', className: 'bg-muted text-muted-foreground border-border' },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function Financeiro() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ number: '', description: '', amount: '', client_id: '', due_date: '' });
  const { data: invoices = [], isLoading } = useInvoices();
  const { data: clients = [] } = useClients();
  const createInvoice = useCreateInvoice();
  const { toast } = useToast();

  const filtered = (invoices as any[]).filter(
    (i) =>
      (i.clients?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      i.number.toLowerCase().includes(search.toLowerCase())
  );

  const totalReceived = (invoices as any[]).filter((i) => i.status === 'pago').reduce((sum, i) => sum + Number(i.amount), 0);
  const totalPending = (invoices as any[]).filter((i) => i.status === 'pendente').reduce((sum, i) => sum + Number(i.amount), 0);
  const totalOverdue = (invoices as any[]).filter((i) => i.status === 'atrasado').reduce((sum, i) => sum + Number(i.amount), 0);

  const handleCreate = async () => {
    if (!form.number || !form.amount) return;
    try {
      await createInvoice.mutateAsync({
        number: form.number,
        description: form.description || undefined,
        amount: parseFloat(form.amount),
        client_id: form.client_id || undefined,
        due_date: form.due_date || undefined,
      });
      setForm({ number: '', description: '', amount: '', client_id: '', due_date: '' });
      setOpen(false);
      toast({ title: 'Fatura criada com sucesso!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Financeiro</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de honorários e faturamento</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline"><Download className="h-4 w-4" />Exportar</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" />Nova Fatura</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova Fatura</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nº Fatura *</Label>
                    <Input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} placeholder="FAT-2024-001" />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor (R$) *</Label>
                    <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição da fatura" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Cliente</Label>
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                      <option value="">Selecionar...</option>
                      {(clients as any[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Vencimento</Label>
                    <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                  </div>
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={createInvoice.isPending}>
                  {createInvoice.isPending ? 'Salvando...' : 'Criar Fatura'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Recebido" value={formatCurrency(totalReceived)} icon={TrendingUp} description="total recebido" />
        <MetricCard title="A Receber" value={formatCurrency(totalPending)} icon={Clock} description="faturas pendentes" />
        <MetricCard title="Em Atraso" value={formatCurrency(totalOverdue)} icon={TrendingDown} description="faturas atrasadas" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar fatura..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Button variant="outline" size="sm"><Filter className="h-4 w-4" />Filtros</Button>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium">Nenhuma fatura encontrada</p>
            <p className="text-sm mt-1">Crie sua primeira fatura clicando em "Nova Fatura"</p>
          </div>
        ) : (
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
                {filtered.map((invoice: any) => (
                  <tr key={invoice.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors duration-150 cursor-pointer">
                    <td className="py-2 px-4 font-mono text-muted-foreground">{invoice.number}</td>
                    <td className="py-2 px-4 font-medium">{invoice.clients?.name || '—'}</td>
                    <td className="py-2 px-4 text-muted-foreground">{invoice.description || '—'}</td>
                    <td className="py-2 px-4 text-right font-semibold tabular-nums">{formatCurrency(Number(invoice.amount))}</td>
                    <td className="py-2 px-4">
                      <Badge variant="outline" className={`text-xs ${statusConfig[invoice.status as InvoiceStatus]?.className}`}>
                        {statusConfig[invoice.status as InvoiceStatus]?.label || invoice.status}
                      </Badge>
                    </td>
                    <td className="py-2 px-4 tabular-nums">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
