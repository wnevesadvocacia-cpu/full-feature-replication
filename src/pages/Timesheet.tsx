import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Trash2, Clock, DollarSign, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TE { id: string; date: string; hours: number; hourly_rate: number; description: string | null; billable: boolean; invoiced: boolean; process_id: string | null; client_id: string | null; }
interface Proc { id: string; number: string; title: string; }
interface Cli { id: string; name: string; }

export default function Timesheet() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    hours: '1',
    hourly_rate: '300',
    description: '',
    billable: true,
    process_id: '',
    client_id: '',
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['time_entries'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('time_entries').select('*').order('date', { ascending: false });
      if (error) throw error;
      return data as TE[];
    },
  });

  const { data: processes = [] } = useQuery({
    queryKey: ['processes-mini'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('processes').select('id, number, title').limit(500);
      if (error) throw error;
      return data as Proc[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-mini'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name').limit(500);
      if (error) throw error;
      return data as Cli[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id,
        date: form.date,
        hours: parseFloat(form.hours) || 0,
        hourly_rate: parseFloat(form.hourly_rate) || 0,
        description: form.description || null,
        billable: form.billable,
        process_id: form.process_id || null,
        client_id: form.client_id || null,
      };
      const { error } = await (supabase as any).from('time_entries').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time_entries'] });
      setOpen(false);
      setForm({ ...form, hours: '1', description: '' });
      toast({ title: 'Apontamento registrado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('time_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time_entries'] }); toast({ title: 'Excluído' }); },
  });

  const toggleInvoiced = useMutation({
    mutationFn: async ({ id, invoiced }: { id: string; invoiced: boolean }) => {
      const { error } = await (supabase as any).from('time_entries').update({ invoiced }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time_entries'] }),
  });

  const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0);
  const totalValue = entries.filter((e) => e.billable).reduce((s, e) => s + Number(e.hours) * Number(e.hourly_rate), 0);
  const pendingInvoice = entries.filter((e) => e.billable && !e.invoiced).reduce((s, e) => s + Number(e.hours) * Number(e.hourly_rate), 0);

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Timesheet</h1>
          <p className="text-muted-foreground text-sm mt-1">Apontamento de horas e honorários por hora</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo Apontamento</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-card border rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase">Total de Horas</p>
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold mt-2">{totalHours.toFixed(2)}h</p>
        </div>
        <div className="bg-card border rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase">Valor Faturável</p>
            <DollarSign className="h-4 w-4 text-success" />
          </div>
          <p className="text-2xl font-bold mt-2">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-card border rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase">A Faturar</p>
            <DollarSign className="h-4 w-4 text-warning" />
          </div>
          <p className="text-2xl font-bold mt-2 text-warning">R$ {pendingInvoice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="p-3">Data</th>
              <th className="p-3">Horas</th>
              <th className="p-3">R$/h</th>
              <th className="p-3">Total</th>
              <th className="p-3">Descrição</th>
              <th className="p-3">Status</th>
              <th className="p-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum apontamento ainda.</td></tr>
            ) : entries.map((e) => (
              <tr key={e.id} className="border-t hover:bg-muted/30">
                <td className="p-3">{new Date(e.date).toLocaleDateString('pt-BR')}</td>
                <td className="p-3 font-mono">{Number(e.hours).toFixed(2)}h</td>
                <td className="p-3 font-mono">R$ {Number(e.hourly_rate).toFixed(2)}</td>
                <td className="p-3 font-mono font-medium">R$ {(Number(e.hours) * Number(e.hourly_rate)).toFixed(2)}</td>
                <td className="p-3 max-w-xs truncate text-muted-foreground">{e.description || '—'}</td>
                <td className="p-3">
                  {!e.billable ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">não faturável</span>
                  ) : e.invoiced ? (
                    <button onClick={() => toggleInvoiced.mutate({ id: e.id, invoiced: false })}
                      className="text-xs px-2 py-0.5 rounded bg-success/15 text-success flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> faturado
                    </button>
                  ) : (
                    <button onClick={() => toggleInvoiced.mutate({ id: e.id, invoiced: true })}
                      className="text-xs px-2 py-0.5 rounded bg-warning/15 text-warning hover:bg-warning/25">
                      a faturar
                    </button>
                  )}
                </td>
                <td className="p-3">
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate(e.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Apontamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Data</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Horas</Label><Input type="number" step="0.25" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></div>
              <div><Label>R$ / hora</Label><Input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Processo</Label>
                <Select value={form.process_id} onValueChange={(v) => setForm({ ...form, process_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{processes.map((p) => <SelectItem key={p.id} value={p.id}>{p.number}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cliente</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrição da atividade</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Reunião com cliente, redação de contestação, audiência…" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} />
              Faturável ao cliente
            </label>
            <p className="text-sm text-muted-foreground">Total: <span className="font-bold text-foreground">R$ {((parseFloat(form.hours) || 0) * (parseFloat(form.hourly_rate) || 0)).toFixed(2)}</span></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
