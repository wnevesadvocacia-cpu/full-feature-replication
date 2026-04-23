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
import { Plus, Loader2, Trash2, FileSignature, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FA {
  id: string;
  type: 'fixo' | 'exito' | 'hora' | 'parcelado';
  fixed_amount: number | null;
  success_percent: number | null;
  hourly_rate: number | null;
  installments_count: number | null;
  installments_paid: number;
  total_estimated: number | null;
  status: string;
  notes: string | null;
  process_id: string | null;
  client_id: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  fixo: 'Honorário fixo',
  exito: 'Êxito (% do ganho)',
  hora: 'Por hora',
  parcelado: 'Parcelado',
};

export default function Honorarios() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: 'fixo',
    fixed_amount: '',
    success_percent: '',
    hourly_rate: '',
    installments_count: '',
    total_estimated: '',
    status: 'ativo',
    notes: '',
    process_id: '',
    client_id: '',
  });

  const { data: agreements = [], isLoading } = useQuery({
    queryKey: ['fee_agreements'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('fee_agreements').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as FA[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-mini-fa'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name').limit(500);
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: processes = [] } = useQuery({
    queryKey: ['processes-mini-fa'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('processes').select('id, number').limit(500);
      if (error) throw error;
      return data as { id: string; number: string }[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        user_id: user!.id,
        type: form.type,
        status: form.status,
        notes: form.notes || null,
        process_id: form.process_id || null,
        client_id: form.client_id || null,
        fixed_amount: form.fixed_amount ? parseFloat(form.fixed_amount) : null,
        success_percent: form.success_percent ? parseFloat(form.success_percent) : null,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        installments_count: form.installments_count ? parseInt(form.installments_count) : null,
        total_estimated: form.total_estimated ? parseFloat(form.total_estimated) : null,
      };
      const { error } = await (supabase as any).from('fee_agreements').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fee_agreements'] });
      setOpen(false);
      toast({ title: 'Contrato criado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('fee_agreements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee_agreements'] }),
  });

  const incInst = useMutation({
    mutationFn: async (a: FA) => {
      const next = Math.min((a.installments_paid || 0) + 1, a.installments_count || 0);
      const { error } = await (supabase as any).from('fee_agreements').update({ installments_paid: next }).eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fee_agreements'] }); toast({ title: 'Parcela registrada' }); },
  });

  const totalEstimated = agreements.reduce((s, a) => s + Number(a.total_estimated || a.fixed_amount || 0), 0);
  const ativos = agreements.filter((a) => a.status === 'ativo').length;

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Honorários</h1>
          <p className="text-muted-foreground text-sm mt-1">Contratos de honorários: fixo, êxito, hora ou parcelado</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo Contrato</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-card border rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase">Contratos Ativos</p>
            <FileSignature className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold mt-2">{ativos}</p>
        </div>
        <div className="bg-card border rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase">Receita Estimada</p>
            <TrendingUp className="h-4 w-4 text-success" />
          </div>
          <p className="text-2xl font-bold mt-2">R$ {totalEstimated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-card border rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase">Total de Contratos</p>
            <FileSignature className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold mt-2">{agreements.length}</p>
        </div>
      </div>

      {agreements.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border rounded-lg">
          <FileSignature className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>Nenhum contrato de honorário cadastrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agreements.map((a) => (
            <div key={a.id} className="bg-card border rounded-lg p-4 shadow-card hover:shadow-card-hover">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{TYPE_LABEL[a.type]}</span>
                  <p className="text-xs text-muted-foreground mt-1">Status: {a.status}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate(a.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {a.type === 'fixo' && a.fixed_amount && (
                  <p className="text-lg font-bold">R$ {Number(a.fixed_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                )}
                {a.type === 'exito' && a.success_percent && (
                  <p className="text-lg font-bold">{a.success_percent}% do êxito</p>
                )}
                {a.type === 'hora' && a.hourly_rate && (
                  <p className="text-lg font-bold">R$ {Number(a.hourly_rate).toFixed(2)}/h</p>
                )}
                {a.type === 'parcelado' && a.installments_count && (
                  <>
                    <p className="text-lg font-bold">{a.installments_paid}/{a.installments_count} parcelas</p>
                    {a.fixed_amount && (
                      <p className="text-xs text-muted-foreground">
                        R$ {(Number(a.fixed_amount) / a.installments_count).toFixed(2)} por parcela
                      </p>
                    )}
                    <Button size="sm" variant="outline" className="mt-2 w-full"
                      disabled={a.installments_paid >= a.installments_count}
                      onClick={() => incInst.mutate(a)}>
                      Marcar parcela paga
                    </Button>
                  </>
                )}
                {a.notes && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{a.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Novo Contrato de Honorários</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="encerrado">Encerrado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cliente</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Processo</Label>
                <Select value={form.process_id} onValueChange={(v) => setForm({ ...form, process_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{processes.map((p) => <SelectItem key={p.id} value={p.id}>{p.number}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {(form.type === 'fixo' || form.type === 'parcelado') && (
              <div><Label>Valor total (R$)</Label><Input type="number" step="0.01" value={form.fixed_amount} onChange={(e) => setForm({ ...form, fixed_amount: e.target.value })} /></div>
            )}
            {form.type === 'exito' && (
              <div><Label>Percentual de êxito (%)</Label><Input type="number" step="0.1" value={form.success_percent} onChange={(e) => setForm({ ...form, success_percent: e.target.value })} /></div>
            )}
            {form.type === 'hora' && (
              <div><Label>Valor da hora (R$)</Label><Input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} /></div>
            )}
            {form.type === 'parcelado' && (
              <div><Label>Número de parcelas</Label><Input type="number" value={form.installments_count} onChange={(e) => setForm({ ...form, installments_count: e.target.value })} /></div>
            )}
            <div><Label>Receita estimada total (R$)</Label><Input type="number" step="0.01" value={form.total_estimated} onChange={(e) => setForm({ ...form, total_estimated: e.target.value })} placeholder="opcional, p/ DRE" /></div>
            <div><Label>Observações</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
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
