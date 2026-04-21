import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Filter, MoreHorizontal, Calendar, User, Loader2, ChevronLeft, ChevronRight, FileText, CheckCircle2, Circle, X } from 'lucide-react';
import { useProcesses, useCreateProcess, PROCESSES_PAGE_SIZE } from '@/hooks/useProcesses';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-700',
  closed: 'bg-red-100 text-red-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-yellow-100 text-yellow-700',
  baixa: 'bg-green-100 text-green-700',
};

interface Process {
  id: string;
  number: string;
  title: string;
  type?: string;
  status?: string;
  due_date?: string;
  lawyer?: string;
  value?: number;
  clients?: { name: string };
  created_at: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: string;
  completed: boolean;
  created_at: string;
}

function useProcessTasks(processId: string | null) {
  return useQuery({
    queryKey: ['process-tasks', processId],
    enabled: !!processId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('process_id', processId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Task[];
    },
  });
}

export default function Processos() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [newOpen, setNewOpen] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
  const [newForm, setNewForm] = useState({
    number: '', title: '', type: '', status: 'active', lawyer: '', value: '',
  });

  const { data, isLoading } = useProcesses(page);
  const processes: Process[] = data?.data ?? data ?? [];
  const totalCount: number = data?.count ?? processes.length;
  const totalPages = Math.ceil(totalCount / PROCESSES_PAGE_SIZE);

  const createProcess = useCreateProcess();
  const { data: processTasks = [], isLoading: tasksLoading } = useProcessTasks(selectedProcess?.id ?? null);

  const filtered = useMemo(() => {
    let list = processes;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.number?.toLowerCase().includes(q) ||
        p.title?.toLowerCase().includes(q) ||
        p.clients?.name?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(p => p.status === statusFilter);
    }
    return list;
  }, [processes, search, statusFilter]);

  async function handleCreate() {
    await createProcess.mutateAsync({
      number: newForm.number,
      title: newForm.title,
      type: newForm.type || null,
      status: newForm.status,
      lawyer: newForm.lawyer || null,
      value: newForm.value ? parseFloat(newForm.value) : null,
    });
    setNewOpen(false);
    setNewForm({ number: '', title: '', type: '', status: 'active', lawyer: '', value: '' });
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Processos</h1>
          <p className="text-sm text-gray-500">{totalCount.toLocaleString('pt-BR')} processos cadastrados</p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo processo
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Buscar por número, título ou cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="archived">Arquivado</SelectItem>
            <SelectItem value="closed">Encerrado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">Nenhum processo encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Número</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Título</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Prazo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Advogado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(p => (
                <tr
                  key={p.id}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedProcess(p)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-blue-600">{p.number}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{p.title}</td>
                  <td className="px-4 py-3 text-gray-500">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {p.clients?.name ?? '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status ?? 'active'] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.status ?? 'active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {p.due_date ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(p.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.lawyer ?? '—'}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelectedProcess(p)}>
                          Ver andamentos
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Página {page + 1} de {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Andamentos Sheet */}
      <Sheet open={!!selectedProcess} onOpenChange={open => { if (!open) setSelectedProcess(null); }}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          {selectedProcess && (
            <>
              <SheetHeader className="pb-4 border-b">
                <SheetTitle className="font-mono text-blue-600 text-sm">{selectedProcess.number}</SheetTitle>
                <SheetDescription className="font-semibold text-gray-800 text-base leading-snug">
                  {selectedProcess.title}
                </SheetDescription>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selectedProcess.status ?? 'active'] ?? 'bg-gray-100'}`}>
                    {selectedProcess.status ?? 'active'}
                  </span>
                  {selectedProcess.clients?.name && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <User className="w-3 h-3" /> {selectedProcess.clients.name}
                    </span>
                  )}
                  {selectedProcess.lawyer && (
                    <span className="text-xs text-gray-500">{selectedProcess.lawyer}</span>
                  )}
                </div>
              </SheetHeader>

              <div className="pt-4">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  Andamentos / Movimentações
                  <Badge variant="secondary">{processTasks.length}</Badge>
                </h3>

                {tasksLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  </div>
                ) : processTasks.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-sm">
                    Nenhum andamento registrado para este processo.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {processTasks.map((t, idx) => (
                      <div key={t.id} className="relative pl-6">
                        {idx < processTasks.length - 1 && (
                          <div className="absolute left-2 top-5 bottom-0 w-px bg-gray-200" />
                        )}
                        <div className="absolute left-0 top-1">
                          {t.completed
                            ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                            : <Circle className="w-4 h-4 text-gray-300" />}
                        </div>
                        <div className={`p-3 rounded-lg border ${t.completed ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <p className={`font-medium text-sm ${t.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              {t.title}
                            </p>
                            {t.priority && (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${PRIORITY_COLORS[t.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                                {t.priority}
                              </span>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-xs text-gray-500 mt-1">{t.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1.5">
                            {new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {t.due_date && ` · Prazo: ${new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* New Process Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo processo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {[
              { label: 'Número *', key: 'number', placeholder: 'Ex: 0001234-56.2024.8.16.0001' },
              { label: 'Título *', key: 'title', placeholder: 'Descrição resumida' },
              { label: 'Tipo', key: 'type', placeholder: 'Ex: Cível, Criminal...' },
              { label: 'Advogado', key: 'lawyer', placeholder: 'Nome do advogado' },
              { label: 'Valor (R$)', key: 'value', placeholder: '0.00' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  placeholder={placeholder}
                  value={newForm[key as keyof typeof newForm]}
                  onChange={e => setNewForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <Label>Status</Label>
              <Select value={newForm.status} onValueChange={v => setNewForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="archived">Arquivado</SelectItem>
                  <SelectItem value="closed">Encerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newForm.number || !newForm.title || createProcess.isPending}>
              {createProcess.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
        }
