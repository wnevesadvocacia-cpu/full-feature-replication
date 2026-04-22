import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Filter, ChevronLeft, ChevronRight, Plus,
  User, MapPin, Gavel, Calendar, DollarSign, MessageSquare, X
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Process {
  id: string;
  number: string;
  title: string;
  status: string;
  type: string | null;
  client_name: string | null;
  client_id: string | null;
  comarca: string | null;
  vara: string | null;
  tribunal: string | null;
  opponent: string | null;
  phase: string | null;
  stage: string | null;
  responsible: string | null;
  lawyer: string | null;
  honorarios_valor: number | null;
  honorarios_percent: number | null;
  cause_value: number | null;
  contingency: number | null;
  last_update: string | null;
  observations: string | null;
  created_at: string;
  updated_at: string;
  request_date: string | null;
  closing_date: string | null;
  result: string | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  em_andamento: 'Em Andamento',
  aguardando: 'Aguardando',
  concluido: 'Concluído',
  ativo: 'Ativo',
  arquivado: 'Arquivado',
  recursal: 'Recursal',
  sobrestamento: 'Sobrestamento',
  active: 'Ativo',
  archived: 'Arquivado',
  pending: 'Aguardando',
  closed: 'Concluído',
};

const STATUS_COLORS: Record<string, string> = {
  novo: 'bg-blue-100 text-blue-800',
  em_andamento: 'bg-green-100 text-green-800',
  aguardando: 'bg-yellow-100 text-yellow-800',
  concluido: 'bg-gray-100 text-gray-700',
  ativo: 'bg-green-100 text-green-800',
  arquivado: 'bg-gray-100 text-gray-700',
  recursal: 'bg-purple-100 text-purple-800',
  sobrestamento: 'bg-orange-100 text-orange-800',
  active: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-800',
  closed: 'bg-gray-100 text-gray-700',
};

const PAGE_SIZE = 50;

const ALL_STATUSES = [
  { value: '', label: 'Todos os status' },
  { value: 'novo', label: 'Novo' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'aguardando', label: 'Aguardando' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'recursal', label: 'Recursal' },
  { value: 'sobrestamento', label: 'Sobrestamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'arquivado', label: 'Arquivado' },
];

const EMPTY = '—';

function formatCurrency(v: number | null) {
  if (v == null) return EMPTY;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDate(s: string | null | undefined) {
  if (!s) return EMPTY;
  return new Date(s).toLocaleDateString('pt-BR');
}
function val(s: string | null | undefined) {
  return s || EMPTY;
}

const FULL_SELECT = [
  'id', 'number', 'title', 'status', 'type',
  'client_id', 'client_name', 'comarca', 'vara', 'tribunal',
  'opponent', 'phase', 'stage', 'responsible', 'lawyer',
  'honorarios_valor', 'honorarios_percent', 'cause_value', 'contingency',
  'last_update', 'observations', 'created_at', 'updated_at',
  'request_date', 'closing_date', 'result',
].join(',');

function useProcesses(search: string, status: string, page: number) {
  return useQuery({
    queryKey: ['processes', search, status, page],
    queryFn: async () => {
      let q = supabase
        .from('processes')
        .select(FULL_SELECT, { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (search) q = q.or(`number.ilike.%${search}%,title.ilike.%${search}%,client_name.ilike.%${search}%`);
      if (status) q = q.eq('status', status);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Process[], total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
  });
}

function useProcessTasks(processId: string | null) {
  return useQuery({
    queryKey: ['tasks', processId],
    enabled: !!processId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('process_id', processId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
}

function useAddTask(processId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; description: string; due_date: string }) => {
      const { error } = await supabase.from('tasks').insert({
        ...payload,
        process_id: processId,
        completed: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', processId] });
      toast({ title: 'Andamento adicionado.' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });
}

export default function Processos() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Process | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '', due_date: '' });
  const [showTaskForm, setShowTaskForm] = useState(false);

  const { data, isLoading } = useProcesses(search, status, page);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const { data: tasks = [] } = useProcessTasks(selected?.id ?? null);
  const addTask = useAddTask(selected?.id ?? null);

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(0); }, []);
  const handleStatus = useCallback((v: string) => { setStatus(v); setPage(0); }, []);

  const submitTask = () => {
    if (!newTask.title.trim()) return;
    addTask.mutate(newTask);
    setNewTask({ title: '', description: '', due_date: '' });
    setShowTaskForm(false);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Processos{' '}
          {!isLoading && (
            <span className="text-base font-normal text-gray-500">
              ({total.toLocaleString('pt-BR')})
            </span>
          )}
        </h1>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por número, título, cliente…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={status}
            onChange={(e) => handleStatus(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Carregando processos…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Nenhum processo encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3">Número</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Comarca</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelected(p)}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-blue-700">{p.number || EMPTY}</td>
                      <td className="px-4 py-3 max-w-[180px] truncate">{val(p.client_name)}</td>
                      <td className="px-4 py-3 text-gray-600">{val(p.comarca)}</td>
                      <td className="px-4 py-3 text-gray-600">{val(p.type)}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(p.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total.toLocaleString('pt-BR')}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Página {page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detalhe */}
      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setShowTaskForm(false); } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">{selected.number || selected.title}</SheetTitle>
                <Badge className={`w-fit text-xs ${STATUS_COLORS[selected.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </Badge>
              </SheetHeader>

              <div className="mt-4 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><User className="h-3 w-3" /> Cliente</p>
                    <p className="text-sm font-medium mt-0.5">{val(selected.client_name)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Parte Contrária</p>
                    <p className="text-sm font-medium mt-0.5">{val(selected.opponent)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><MapPin className="h-3 w-3" /> Comarca</p>
                    <p className="text-sm mt-0.5">{val(selected.comarca)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Vara</p>
                    <p className="text-sm mt-0.5">{val(selected.vara)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Tribunal</p>
                    <p className="text-sm mt-0.5">{val(selected.tribunal)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><Gavel className="h-3 w-3" /> Fase</p>
                    <p className="text-sm mt-0.5">{val(selected.phase)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Etapa</p>
                    <p className="text-sm mt-0.5">{val(selected.stage)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Responsável</p>
                    <p className="text-sm mt-0.5">{val(selected.responsible ?? selected.lawyer)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Tipo</p>
                    <p className="text-sm mt-0.5">{val(selected.type)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><DollarSign className="h-3 w-3" /> Valor Causa</p>
                    <p className="text-sm font-medium mt-0.5">{formatCurrency(selected.cause_value)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Honorários</p>
                    <p className="text-sm font-medium mt-0.5">
                      {selected.honorarios_valor != null
                        ? formatCurrency(selected.honorarios_valor)
                        : selected.honorarios_percent != null
                        ? `${selected.honorarios_percent}%`
                        : EMPTY}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Contingência</p>
                    <p className="text-sm font-medium mt-0.5">
                      {selected.contingency != null ? `${selected.contingency}%` : EMPTY}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><Calendar className="h-3 w-3" /> Data Entrada</p>
                    <p className="text-sm mt-0.5">{formatDate(selected.request_date ?? selected.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Última Atualiz.</p>
                    <p className="text-sm mt-0.5">{formatDate(selected.last_update ?? selected.updated_at)}</p>
                  </div>
                </div>

                {selected.result && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Resultado</p>
                    <p className="text-sm mt-0.5">{selected.result}</p>
                  </div>
                )}

                {selected.observations && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Observações</p>
                    <p className="text-sm mt-0.5 text-gray-700 whitespace-pre-wrap">{selected.observations}</p>
                  </div>
                )}

                {/* Andamentos */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" /> Andamentos ({tasks.length})
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setShowTaskForm((v) => !v)}>
                      <Plus className="h-3 w-3 mr-1" /> Adicionar
                    </Button>
                  </div>

                  {showTaskForm && (
                    <div className="border rounded-md p-3 space-y-2 mb-3 bg-gray-50">
                      <Input
                        placeholder="Título do andamento"
                        value={newTask.title}
                        onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                      />
                      <Textarea
                        placeholder="Descrição (opcional)"
                        value={newTask.description}
                        onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                        rows={2}
                      />
                      <Input
                        type="date"
                        value={newTask.due_date}
                        onChange={(e) => setNewTask((p) => ({ ...p, due_date: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={submitTask} disabled={addTask.isPending}>
                          {addTask.isPending ? 'Salvando…' : 'Salvar'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowTaskForm(false)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {tasks.length === 0 ? (
                      <p className="text-xs text-gray-400">Sem andamentos registrados.</p>
                    ) : tasks.map((t) => (
                      <div key={t.id} className="text-sm border rounded-md p-2 bg-white">
                        <p className="font-medium">{t.title}</p>
                        {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                        {t.due_date && <p className="text-xs text-gray-400 mt-1">{formatDate(t.due_date)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
