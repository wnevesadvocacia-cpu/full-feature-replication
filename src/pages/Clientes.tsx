import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Filter, Mail, Phone, MoreHorizontal, Loader2, Scale } from 'lucide-react';
import { useClients, useCreateClient } from '@/hooks/useClients';
import { useProcesses } from '@/hooks/useProcesses';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import CsvImportDialog from '@/components/CsvImportDialog';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function Clientes() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', type: 'PF' as 'PF' | 'PJ', document: '' });
  const { data: clients = [], isLoading } = useClients();
  // useProcesses returns { rows, total } — extract array safely
  const { data: processesData } = useProcesses();
  const processes = processesData?.rows ?? [];
  const createClient = useCreateClient();
  const { toast } = useToast();

  const filtered = (clients as any[]).filter(
    (c: any) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.document || '').includes(search)
  );

  const handleCreate = async () => {
    if (!form.name) return;
    try {
      await createClient.mutateAsync(form);
      setForm({ name: '', email: '', phone: '', type: 'PF', document: '' });
      setOpen(false);
      toast({ title: 'Cliente criado com sucesso!' });
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
          <h1 className="text-2xl font-display font-bold">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">{(clients as any[]).length} clientes cadastrados</p>
        </div>
        <div className="flex gap-2">
          <CsvImportDialog />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" />Novo Cliente</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do cliente" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-2">
                  <Label>Tipo</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'PF' | 'PJ' }))}>
                    <option value="PF">Pessoa Física</option>
                    <option value="PJ">Pessoa Jurídica</option>
                  </select>
                </div>
                <div className="flex-1 space-y-2">
                  <Label>CPF/CNPJ</Label>
                  <Input value={form.document} onChange={e => setForm(f => ({ ...f, document: e.target.value }))} placeholder="000.000.000-00" />
                </div>
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={createClient.isPending}>
                {createClient.isPending ? 'Salvando...' : 'Salvar Cliente'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button variant="outline" size="sm"><Filter className="h-4 w-4" />Filtros</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Nenhum cliente encontrado</p>
          <p className="text-sm mt-1">Crie seu primeiro cliente clicando em "Novo Cliente"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((client: any) => (
            <div key={client.id} className="bg-card rounded-lg p-5 shadow-card hover:shadow-card-hover transition-shadow duration-200 group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-semibold text-sm">{client.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{client.name}</h3>
                    <Badge variant="outline" className="text-xs mt-0.5">{client.type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</Badge>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                {client.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /><span>{client.email}</span></div>}
                {client.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /><span>{client.phone}</span></div>}
              </div>
              {(() => {
                const clientProcesses = processes.filter((p: any) => p.client_id === client.id);
                return clientProcesses.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Scale className="h-3 w-3" />
                      <span>Processos ({clientProcesses.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {clientProcesses.map((p: any) => (
                        <Badge key={p.id} variant="outline" className="text-xs font-mono">
                          #{p.number}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
              <div className="mt-4 pt-3 border-t flex items-center justify-between text-sm">
                <Badge variant="outline" className={client.status === 'ativo' ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground'}>{client.status}</Badge>
                {client.document && <span className="text-xs text-muted-foreground font-mono">{client.document}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
                }
