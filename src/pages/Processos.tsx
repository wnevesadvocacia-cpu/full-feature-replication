import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Filter, MoreHorizontal, Calendar, User, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useProcesses, useCreateProcess, PROCESSES_PAGE_SIZE } from '@/hooks/useProcesses';
import { useClients } from '@/hooks/useClients';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type ProcessStatus = 'novo' | 'em_andamento' | 'aguardando' | 'concluido';

const statusConfig: Record<ProcessStatus, { label: string; className: string }> = {
  novo: { label: 'Novo', className: 'bg-info/10 text-info border-info/20' },
  em_andamento: { label: 'Em Andamento', className: 'bg-primary/10 text-primary border-primary/20' },
  aguardando: { label: 'Aguardando', className: 'bg-warning/10 text-warning border-warning/20' },
  concluido: { label: 'Concluído', className: 'bg-success/10 text-success border-success/20' },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

type ViewMode = 'kanban' | 'list';

export default function Processos() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('kanban');
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState({ number: '', title: '', type: '', lawyer: '', value: '', client_id: '', due_date: '' });
  const { data, isLoading, isFetching } = useProcesses(page);
  const processes = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PROCESSES_PAGE_SIZE));
  const { data: clients = [] } = useClients();
  const createProcess = useCreateProcess();
  const { toast } = useToast();

  const filtered = useMemo(
    () =>
      (processes as any[]).filter(
        (p) =>
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          (p.clients?.name || '').toLowerCase().includes(search.toLowerCase()) ||
          p.number.includes(search)
      ),
    [processes, search]
  );

  const columns: ProcessStatus[] = ['novo', 'em_andamento', 'aguardando', 'concluido'];

  const handleCreate = async () => {
    if (!form.number || !form.title) return;
    try {
      await createProcess.mutateAsync({
        number: form.number,
        title: form.title,
        type: form.type || undefined,
        lawyer: form.lawyer || undefined,
        value: form.value ? parseFloat(form.value) : undefined,
        client_id: form.client_id || undefined,
        due_date: form.due_date || undefined,
      });
      setForm({ number: '', title: '', type: '', lawyer: '', value: '', client_id: '', due_date: '' });
      setOpen(false);
      toast({ title: 'Processo criado com sucesso!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const rangeStart = total === 0 ? 0 : page * PROCESSES_PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PROCESSES_PAGE_SIZE, total);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Processos</h1>
          <p className="text-muted-foreground text-sm mt-1">{total} processos no total</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" />Novo Processo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Processo</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Número *</Label>
                  <Input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} placeholder="2024-0001" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Input value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} placeholder="Trabalhista" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Descrição do processo" />
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
                  <Label>Responsável</Label>
                  <Input value={form.lawyer} onChange={e => setForm(f => ({ ...f, lawyer: e.target.value }))} placeholder="Dr. Nome" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>Prazo</Label>
                  <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={createProcess.isPending}>
                {createProcess.isPending ? 'Salvando...' : 'Criar Processo'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar processo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button variant="outline" size="sm"><Filter className="h-4 w-4" />Filtros</Button>
        <div className="flex items-center border rounded-md overflow-hidden ml-auto">
          <button onClick={() => setView('kanban')} className={`px-3 py-1.5 text-sm transition-colors ${view === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}>Kanban</button>
          <button onClick={() => setView('list')} className={`px-3 py-1.5 text-sm transition-colors ${view === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}>Lista</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Nenhum processo encontrado</p>
          <p className="text-sm mt-1">Crie seu primeiro processo clicando em "Novo Processo"</p>
        </div>
      ) : view === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columns.map((status) => {
            const col = filtered.filter((p: any) => p.status === status);
            const config = statusConfig[status];
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{config.label}</h3>
                    <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 tabular-nums">{col.length}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {col.map((process: any) => (
                    <div key={process.id} className="bg-card rounded-lg p-4 shadow-card hover:shadow-card-hover transition-shadow duration-200 cursor-pointer group">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs text-muted-foreground font-mono">#{process.number}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </div>
                      <h4 className="text-sm font-medium leading-snug mb-2">{process.title}</h4>
                      {process.type && <Badge variant="outline" className={`text-xs ${config.className} mb-3`}>{process.type}</Badge>}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{process.clients?.name || '—'}</span>
                        </div>
                        {process.due_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(process.due_date).toLocaleDateString('pt-BR')}</span>
                          </div>
                        )}
                      </div>
                      {process.value && <p className="text-sm font-semibold mt-2 tabular-nums">{formatCurrency(Number(process.value))}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card rounded-lg shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nº</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Título</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Valor</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Prazo</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((process: any) => (
                <tr key={process.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors duration-150 cursor-pointer">
                  <td className="py-2 px-4 font-mono text-muted-foreground">#{process.number}</td>
                  <td className="py-2 px-4 font-medium">{process.title}</td>
                  <td className="py-2 px-4">{process.clients?.name || '—'}</td>
                  <td className="py-2 px-4"><Badge variant="outline" className="text-xs">{process.type || '—'}</Badge></td>
                  <td className="py-2 px-4">
                    <Badge variant="outline" className={`text-xs ${statusConfig[process.status as ProcessStatus]?.className}`}>
                      {statusConfig[process.status as ProcessStatus]?.label || process.status}
                    </Badge>
                  </td>
                  <td className="py-2 px-4 tabular-nums font-medium">{process.value ? formatCurrency(Number(process.value)) : '—'}</td>
                  <td className="py-2 px-4 tabular-nums">{process.due_date ? new Date(process.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="py-2 px-4">{process.lawyer || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground tabular-nums">
            Mostrando {rangeStart}–{rangeEnd} de {total}
            {isFetching && <Loader2 className="inline h-3 w-3 ml-2 animate-spin" />}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="text-sm tabular-nums px-2">
              Página {page + 1} de {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
