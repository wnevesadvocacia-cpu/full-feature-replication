import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileSignature, Plus, Eye, Trash2, Download, CheckCircle2, Clock } from 'lucide-react';

export default function Assinaturas() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [form, setForm] = useState({ client_id: '', title: '', description: '', expires_days: '30' });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['signature-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signature_requests')
        .select('*, clients:client_id(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-for-signatures'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name').order('name').limit(2000);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.client_id) throw new Error('Selecione um cliente');
      if (!form.title.trim()) throw new Error('Informe um título');
      const expires_at = form.expires_days
        ? new Date(Date.now() + parseInt(form.expires_days) * 86400_000).toISOString()
        : null;
      const { error } = await supabase.from('signature_requests').insert({
        user_id: user!.id,
        client_id: form.client_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        expires_at,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Solicitação criada' });
      setOpen(false);
      setForm({ client_id: '', title: '', description: '', expires_days: '30' });
      qc.invalidateQueries({ queryKey: ['signature-requests'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('signature_requests').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Solicitação excluída' });
      qc.invalidateQueries({ queryKey: ['signature-requests'] });
    },
  });

  const downloadSig = (sig: any) => {
    const a = document.createElement('a');
    a.href = sig.signature_data_url;
    a.download = `assinatura-${sig.signer_name?.replace(/\s+/g, '_') || sig.id}.png`;
    a.click();
  };

  const statusBadge = (s: string) => {
    if (s === 'assinado') return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3 w-3" />Assinado</Badge>;
    if (s === 'expirado') return <Badge variant="secondary">Expirado</Badge>;
    if (s === 'recusado') return <Badge variant="destructive">Recusado</Badge>;
    return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pendente</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature className="h-6 w-6" />
            Assinatura Digital
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Solicite assinaturas dos clientes via Portal do Cliente.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova solicitação</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova solicitação de assinatura</DialogTitle>
              <DialogDescription>
                O cliente verá esta solicitação ao acessar o Portal do Cliente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Cliente *</label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Título *</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex.: Procuração ad judicia"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Instruções ou contexto sobre o documento"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Validade (dias)</label>
                <Input
                  type="number"
                  value={form.expires_days}
                  onChange={(e) => setForm({ ...form, expires_days: e.target.value })}
                  min={1}
                />
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">
                Criar solicitação
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando…</CardContent></Card>
      ) : requests.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
          Nenhuma solicitação. Crie a primeira para enviar ao cliente.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{r.title}</p>
                    {statusBadge(r.status)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Cliente: <span className="font-medium">{r.clients?.name || '—'}</span>
                  </p>
                  {r.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                    <span>Criado: {new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
                    {r.expires_at && <span>Expira: {new Date(r.expires_at).toLocaleDateString('pt-BR')}</span>}
                    {r.signed_at && <span className="text-emerald-600">Assinado: {new Date(r.signed_at).toLocaleString('pt-BR')}</span>}
                    {r.signer_name && <span>Por: <span className="font-medium">{r.signer_name}</span></span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {r.signature_data_url && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => setViewing(r)} title="Ver assinatura">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => downloadSig(r)} title="Baixar PNG">
                        <Download className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    size="icon" variant="ghost"
                    onClick={() => { if (confirm('Excluir esta solicitação?')) remove.mutate(r.id); }}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Visualizar assinatura */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>
              Assinado por <span className="font-medium">{viewing?.signer_name}</span> em{' '}
              {viewing?.signed_at && new Date(viewing.signed_at).toLocaleString('pt-BR')}
            </DialogDescription>
          </DialogHeader>
          {viewing?.signature_data_url && (
            <div className="border rounded-md bg-muted/20 p-4 flex items-center justify-center">
              <img src={viewing.signature_data_url} alt="Assinatura" className="max-h-64" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
