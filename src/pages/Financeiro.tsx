import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Plus, Search, TrendingUp, TrendingDown, Clock, Download, Loader2,
  Pencil, Trash2, AlertTriangle, CheckCircle, XCircle,
} from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';
import { useInvoices, useCreateInvoice } from '@/hooks/useInvoices';
import { useClients } from '@/hooks/useClients';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

type InvoiceStatus = 'pago' | 'pendente' | 'atrasado' | 'cancelado';
type StatusFilter = '' | InvoiceStatus;

const statusConfig: Record<InvoiceStatus, { label: string; className: string }> = {
  pago: { label: 'Pago', className: 'bg-success/10 text-success border-success/20' },
  pendente: { label: 'Pendente', className: 'bg-warning/10 text-warning border-warning/20' },
  atrasado: { label: 'Atrasado', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  cancelado: { label: 'Cancelado', className: 'bg-muted text-muted-foreground border-border' },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (s: string | null | undefined) => {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR');
};

interface InvForm {
  number: string; description: string; amount: string;
  client_id: string; due_date: string; paid_date: string; status: string;
}
const EMPTY_FORM: InvForm = {
  number: '', description: '', amount: '', client_id: '', due_date: '', paid_date: '', status: 'pendente',
};

function invToForm(inv: any): InvForm {
  return {
    number: inv.number ?? '',
    description: inv.description ?? '',
    amount: inv.amount != null ? String(inv.amount) : '',
    client_id: inv.client_id ?? '',
    due_date: inv.due_date ? inv.due_date.slice(0, 10) : '',
    paid_date: inv.paid_date ? inv.paid_date.slice(0, 10) : '',
    status: inv.status ?? 'pendente',
  };
}

export default function Financeiro() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form, setForm] = useState<InvForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: invoices = [], isLoading } = useInvoices();
  const { data: clients = [] } = useClients();
  const createInvoice = useCreateInvoice();
  const { toast } = useToast();
  const qc = useQueryClient();

  const set = (k: keyof InvForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const filtered = (invoices as any[]).filter((i) => {
    const q = search.toLowerCase();
    const matchSearch =
      (i.clients?.name || '').toLowerCase().includes(q) ||
      i.number.toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || i.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalReceived = (invoices as any[]).filter((i) => i.status === 'pago').reduce((sum, i) => sum + Number(i.amount), 0);
  const totalPending = (invoices as any[]).filter((i) => i.status === 'pendente').reduce((sum, i) => sum + Number(i.amount), 0);
  const totalOverdue = (invoices as any[]).filter((i) => i.status === 'atrasado').reduce((sum, i) => sum + Number(i.amount), 0);

  const handleCreate = async () => {
    if (!form.number || !form.amount) return;
    setSaving(true);
    try {
      await createInvoice.mutateAsync({
        number: form.number,
        description: form.description || undefined,
        amount: parseFloat(form.amount),
        client_id: form.client_id || undefined,
        due_date: form.due_date || undefined,
      });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      toast({ title: 'Fatura criada!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editTarget || !form.amount) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('invoices').update({
        number: form.number,
        description: form.description || null,
        amount: parseFloat(form.amount),
        client_id: form.client_id || null,
        due_date: form.due_date || null,
        paid_date: form.paid_date || null,
        status: form.status,
        updated_at: new Date().toISOString(),
      }).eq('id', editTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setEditTarget(null);
      toast({ title: 'Fatura atualizada!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('invoices').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setDeleteTarget(null);
      toast({ title: 'Fatura excluída.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const quickStatus = async (id: string, status: InvoiceStatus) => {
    try {
      const update: any = { status, updated_at: new Date().toISOString() };
      if (status === 'pago') update.paid_date = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from('invoices').update(update).eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: `Status alterado para ${statusConfig[status].label}` });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const openEdit = (inv: any) => { setForm(invToForm(inv)); setEditTarget(inv); };

  if (isLoading) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const formFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Nº Fatura *</Label>
          <Input className="mt-1" value={form.number} onChange={set('number')} placeholder="FAT-2024-001" />
        </div>
        <div>
          <Label>Valor (R$) *</Label>
          <Input className="mt-1" type="number" value={form.amount} onChange={set('amount')} placeholder="0,00" />
        </div>
      </div>
      <div>
        <Label>Descrição</Label>
        <Input className="mt-1" value={form.description} onChange={set('description')} placeholder="Descrição da fatura" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Cliente</Label>
          <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={form.client_id} onChange={set('client_id')}>
            <option value="">Selecionar…</option>
            {(clients as any[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Status</Label>
          <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={form.status} onChange={set('status')}>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="atrasado">Atrasado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Vencimento</Label>
          <Input className="mt-1" type="date" value={form.due_date} onChange={set('due_date')} />
        </div>
        <div>
          <Label>Data Pagamento</Label>
          <Input className="mt-1" type="date" value={form.paid_date} onChange={set('paid_date')} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Financeiro</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de honorários e faturamento</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova Fatura
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Recebido" value={formatCurrency(totalReceived)} icon={TrendingUp} description="total recebido" />
        <MetricCard title="A Receber" value={formatCurrency(totalPending)} icon={Clock} description="faturas pendentes" />
        <MetricCard title="Em Atraso" value={formatCurrency(totalOverdue)} icon={TrendingDown} description="faturas atrasadas" />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar fatura, cliente…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {([
            { v: '', l: 'Todas' },
            { v: 'pendente', l: 'Pendentes' },
            { v: 'pago', l: 'Pagas' },
            { v: 'atrasado', l: 'Atrasadas' },
          ] as { v: StatusFilter; l: string }[]).map(({ v, l }) => (
            <Button key={v} size="sm" variant={statusFilter === v ? 'default' : 'outline'}
              onClick={() => setStatusFilter(v)}>
              {l}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Nenhuma fatura encontrada</p>
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
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Pago em</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((invoice: any) => (
                <tr key={invoice.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors group">
                  <td className="py-2 px-4 font-mono text-muted-foreground">{invoice.number}</td>
                  <td className="py-2 px-4 font-medium max-w-[150px] truncate">{invoice.clients?.name || '—'}</td>
                  <td className="py-2 px-4 text-muted-foreground max-w-[200px] truncate">{invoice.description || '—'}</td>
                  <td className="py-2 px-4 text-right font-semibold tabular-nums">{formatCurrency(Number(invoice.amount))}</td>
                  <td className="py-2 px-4">
                    <Badge variant="outline" className={`text-xs ${statusConfig[invoice.status as InvoiceStatus]?.className}`}>
                      {statusConfig[invoice.status as InvoiceStatus]?.label || invoice.status}
                    </Badge>
                  </td>
                  <td className="py-2 px-4 tabular-nums text-muted-foreground">{formatDate(invoice.due_date)}</td>
                  <td className="py-2 px-4 tabular-nums text-muted-foreground">{formatDate(invoice.paid_date)}</td>
                  <td className="py-2 px-4">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {invoice.status !== 'pago' && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600"
                          title="Marcar como pago"
                          onClick={() => quickStatus(invoice.id, 'pago')}>
                          <CheckCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {invoice.status === 'pendente' && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-orange-600"
                          title="Marcar como atrasado"
                          onClick={() => quickStatus(invoice.id, 'atrasado')}>
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => openEdit(invoice)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500"
                        onClick={() => setDeleteTarget(invoice)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Fatura</DialogTitle></DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.number || !form.amount || saving}>
              {saving ? 'Salvando…' : 'Criar Fatura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Fatura</DialogTitle></DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!form.amount || saving}>
              {saving ? 'Salvando…' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Excluir Fatura
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Excluir fatura <span className="font-semibold font-mono">{deleteTarget?.number}</span>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
