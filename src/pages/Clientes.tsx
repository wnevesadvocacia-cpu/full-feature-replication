import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Search, Mail, Phone, MoreHorizontal, Loader2, Scale,
  Pencil, Trash2, AlertTriangle, User, FileText, X, DollarSign,
} from 'lucide-react';
import { useClients, useCreateClient } from '@/hooks/useClients';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import CsvImportDialog from '@/components/CsvImportDialog';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (s: string | null | undefined) => {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR');
};

type ClientType = 'PF' | 'PJ';

interface ClientForm {
  name: string; email: string; phone: string; type: ClientType;
  document: string; rg: string; birth_date: string;
  marital_status: string; nationality: string; occupation: string;
  status: string;
}

const EMPTY_FORM: ClientForm = {
  name: '', email: '', phone: '', type: 'PF', document: '', rg: '',
  birth_date: '', marital_status: '', nationality: '', occupation: '',
  status: 'ativo',
};

const MARITAL_OPTIONS = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável', 'Outro'];

function clientToForm(c: any): ClientForm {
  return {
    name: c.name ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    type: (c.type === 'PJ' ? 'PJ' : 'PF') as ClientType,
    document: c.document ?? '',
    rg: c.rg ?? '',
    birth_date: c.birth_date ? c.birth_date.slice(0, 10) : '',
    marital_status: c.marital_status ?? '',
    nationality: c.nationality ?? '',
    occupation: c.occupation ?? '',
    status: c.status ?? 'ativo',
  };
}

export default function Clientes() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'PF' | 'PJ'>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: clientsAll = [], isLoading } = useClients();
  // Busca server-side dedicada (cobre casos com >1000 clientes que ficam fora do cache local)
  const { data: searchHits = [] } = useQuery({
    queryKey: ['clients-search', search, typeFilter],
    enabled: !!search.trim(),
    queryFn: async () => {
      const term = search.trim();
      const digits = term.replace(/\D/g, '');
      const orParts = [
        `name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
      ];
      if (digits) {
        orParts.push(`document.ilike.%${digits}%`);
        orParts.push(`phone.ilike.%${digits}%`);
      }
      let q = supabase.from('clients').select('*').or(orParts.join(',')).limit(500);
      if (typeFilter) q = q.eq('type', typeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  // Quando há busca, usa resultados server-side (mais completos); senão lista cacheada
  const clients = search.trim() ? searchHits : clientsAll;
  // Direct query for selected client's processes (avoids pagination limits)
  const { data: clientProcs = [] } = useQuery({
    queryKey: ['client-processes', selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select('id, number, title, status')
        .eq('client_id', selected!.id)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  // Invoices for selected client
  const { data: clientInvoices = [] } = useQuery({
    queryKey: ['client-invoices', selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, number, amount, status, due_date')
        .eq('client_id', selected!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createClient = useCreateClient();
  const { toast } = useToast();
  const qc = useQueryClient();

  const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');
  const filtered = (clients as any[]).filter((c: any) => {
    const q = norm(search.trim());
    if (!q && !typeFilter) return true;
    const qDigits = onlyDigits(search);
    const matchSearch = !q ||
      norm(c.name).includes(q) ||
      norm(c.email || '').includes(q) ||
      (qDigits && (onlyDigits(c.document || '').includes(qDigits) || onlyDigits(c.phone || '').includes(qDigits)));
    const matchType = !typeFilter || c.type === typeFilter;
    return matchSearch && matchType;
  });

  const set = (k: keyof ClientForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const openCreate = () => { setForm(EMPTY_FORM); setCreateOpen(true); };
  const openEdit = (c: any) => { setEditTarget(c); setForm(clientToForm(c)); };

  const handleCreate = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      await createClient.mutateAsync({
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        type: form.type,
        document: form.document || undefined,
      });
      setCreateOpen(false);
      toast({ title: 'Cliente criado com sucesso!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editTarget || !form.name) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          type: form.type,
          document: form.document || null,
          rg: form.rg || null,
          birth_date: form.birth_date || null,
          marital_status: form.marital_status || null,
          nationality: form.nationality || null,
          occupation: form.occupation || null,
          status: form.status,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', editTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['clients'] });
      setEditTarget(null);
      if (selected?.id === editTarget.id) {
        setSelected({ ...selected, ...form });
      }
      toast({ title: 'Cliente atualizado!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('clients').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['clients'] });
      setDeleteTarget(null);
      if (selected?.id === deleteTarget.id) setSelected(null);
      toast({ title: 'Cliente excluído.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // clientProcs is loaded reactively from useQuery above when selected changes

  if (isLoading) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const ClientFormFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Nome completo *</Label>
          <Input className="mt-1" value={form.name} onChange={set('name')} placeholder="Nome do cliente" />
        </div>
        <div>
          <Label>Tipo</Label>
          <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={form.type} onChange={set('type')}>
            <option value="PF">Pessoa Física</option>
            <option value="PJ">Pessoa Jurídica</option>
          </select>
        </div>
        <div>
          <Label>Status</Label>
          <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={form.status} onChange={set('status')}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="prospecto">Prospecto</option>
          </select>
        </div>
        <div>
          <Label>{form.type === 'PF' ? 'CPF' : 'CNPJ'}</Label>
          <Input className="mt-1" value={form.document} onChange={set('document')}
            placeholder={form.type === 'PF' ? '000.000.000-00' : '00.000.000/0001-00'} />
        </div>
        {form.type === 'PF' && (
          <div>
            <Label>RG</Label>
            <Input className="mt-1" value={form.rg} onChange={set('rg')} placeholder="00.000.000-0" />
          </div>
        )}
        <div>
          <Label>Email</Label>
          <Input className="mt-1" type="email" value={form.email} onChange={set('email')} placeholder="email@exemplo.com" />
        </div>
        <div>
          <Label>Telefone</Label>
          <Input className="mt-1" value={form.phone} onChange={set('phone')} placeholder="(45) 99999-9999" />
        </div>
        {form.type === 'PF' && (
          <>
            <div>
              <Label>Data de Nascimento</Label>
              <Input className="mt-1" type="date" value={form.birth_date} onChange={set('birth_date')} />
            </div>
            <div>
              <Label>Estado Civil</Label>
              <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.marital_status} onChange={set('marital_status')}>
                <option value="">Selecionar…</option>
                {MARITAL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <Label>Nacionalidade</Label>
              <Input className="mt-1" value={form.nationality} onChange={set('nationality')} placeholder="Brasileiro(a)" />
            </div>
            <div>
              <Label>Profissão</Label>
              <Input className="mt-1" value={form.occupation} onChange={set('occupation')} />
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">{(clientsAll as any[]).length} clientes cadastrados</p>
        </div>
        <div className="flex gap-2">
          <CsvImportDialog />
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Novo Cliente</Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar nome, email, CPF/CNPJ…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-1">
          {(['', 'PF', 'PJ'] as const).map(t => (
            <Button key={t} size="sm" variant={typeFilter === t ? 'default' : 'outline'}
              onClick={() => setTypeFilter(t)}>
              {t || 'Todos'}
            </Button>
          ))}
        </div>
      </div>

      {/* Grid de cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Nenhum cliente encontrado</p>
          <p className="text-sm mt-1">Crie seu primeiro cliente clicando em "Novo Cliente"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((client: any) => {
            // processes count shown from client record
            return (
              <div key={client.id}
                className="bg-card rounded-lg p-5 shadow-card hover:shadow-card-hover transition-shadow duration-200 group cursor-pointer"
                onClick={() => setSelected(client)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary font-semibold text-sm">
                        {client.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{client.name}</h3>
                      <Badge variant="outline" className="text-xs mt-0.5">
                        {client.type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => openEdit(client)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                      onClick={() => setDeleteTarget(client)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm text-muted-foreground">
                  {client.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /><span className="truncate">{client.email}</span></div>}
                  {client.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /><span>{client.phone}</span></div>}
                </div>



                <div className="mt-4 pt-3 border-t flex items-center justify-between text-sm">
                  <Badge variant="outline" className={client.status === 'ativo'
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-muted text-muted-foreground'}>
                    {client.status}
                  </Badge>
                  {client.document && <span className="text-xs text-muted-foreground font-mono">{client.document}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <SheetTitle className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary font-semibold text-sm">
                        {selected.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span>{selected.name}</span>
                  </SheetTitle>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-8 px-2"
                      onClick={() => { openEdit(selected); setSelected(null); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2 text-red-600"
                      onClick={() => { setDeleteTarget(selected); setSelected(null); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-5 space-y-4">
                <div className="flex gap-2">
                  <Badge>{selected.type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</Badge>
                  <Badge variant="outline" className={selected.status === 'ativo' ? 'text-green-700 border-green-300' : ''}>
                    {selected.status}
                  </Badge>
                </div>

                <div className="space-y-3 text-sm">
                  {selected.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" /><span>{selected.email}</span>
                    </div>
                  )}
                  {selected.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" /><span>{selected.phone}</span>
                    </div>
                  )}
                </div>

                <div className="border rounded-lg divide-y text-sm">
                  {selected.document && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">{selected.type === 'PF' ? 'CPF' : 'CNPJ'}</span>
                      <span className="font-mono">{selected.document}</span>
                    </div>
                  )}
                  {selected.rg && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">RG</span>
                      <span className="font-mono">{selected.rg}</span>
                    </div>
                  )}
                  {selected.birth_date && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">Nascimento</span>
                      <span>{formatDate(selected.birth_date)}</span>
                    </div>
                  )}
                  {selected.marital_status && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">Estado Civil</span>
                      <span>{selected.marital_status}</span>
                    </div>
                  )}
                  {selected.nationality && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">Nacionalidade</span>
                      <span>{selected.nationality}</span>
                    </div>
                  )}
                  {selected.occupation && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">Profissão</span>
                      <span>{selected.occupation}</span>
                    </div>
                  )}
                </div>

                {/* Faturas do cliente */}
                {clientInvoices.length > 0 && (() => {
                  const total = clientInvoices.reduce((s: number, i: any) => s + Number(i.amount), 0);
                  const paid = clientInvoices.filter((i: any) => i.status === 'pago').reduce((s: number, i: any) => s + Number(i.amount), 0);
                  return (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Faturas ({clientInvoices.length}) — Total: {total.toLocaleString('pt-BR', {style:'currency',currency:'BRL'})}
                      </p>
                      <div className="flex gap-3 text-xs">
                        <span className="text-green-600">Recebido: {paid.toLocaleString('pt-BR', {style:'currency',currency:'BRL'})}</span>
                        <span className="text-yellow-600">Pendente: {(total - paid).toLocaleString('pt-BR', {style:'currency',currency:'BRL'})}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Processos do cliente */}
                {(() => {
                  const procs = clientProcs;
                  return procs.length > 0 ? (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Scale className="h-3 w-3" /> Processos ({procs.length})
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {procs.map((p: any) => (
                          <div key={p.id} className="border rounded-md p-2 text-sm">
                            <p className="font-mono font-medium text-blue-700 text-xs">#{p.number}</p>
                            <p className="text-xs text-gray-600 truncate mt-0.5">{p.title}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
          <ClientFormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.name || saving}>
              {saving ? 'Salvando…' : 'Criar Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
          <ClientFormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!form.name || saving}>
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
              <AlertTriangle className="h-5 w-5" /> Excluir Cliente
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Tem certeza que deseja excluir <span className="font-semibold">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
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
