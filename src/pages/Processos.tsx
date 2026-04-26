import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Filter, ChevronLeft, ChevronRight, Plus,
  User, MapPin, Gavel, Calendar, DollarSign, MessageSquare, X,
  Pencil, Trash2, Check, AlertTriangle, Clock, FileText, Download,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { DeleteGuard } from '@/components/DeleteGuard';
import { SearchAutocomplete } from '@/components/SearchAutocomplete';

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

const ALL_STATUSES = [
  { value: 'novo', label: 'Novo' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'aguardando', label: 'Aguardando' },
  { value: 'recursal', label: 'Recursal' },
  { value: 'sobrestamento', label: 'Sobrestamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'arquivado', label: 'Arquivado' },
];

const PAGE_SIZE = 50;
const EMPTY = '—';

function exportToCSV(rows: Process[]) {
  const headers = ['Número','Título','Cliente','Parte Contrária','Status','Tipo','Comarca','Vara','Advogado','Valor Causa','Observações'];
  const escape = (v: string | null | undefined) => {
    const s = v ?? '';
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const rows2 = rows.map(p => [
    p.number, p.title, p.client_name, p.opponent, p.status,
    p.type, p.comarca, p.vara, p.lawyer ?? p.responsible,
    p.cause_value != null ? String(p.cause_value) : '',
    p.observations,
  ].map(escape).join(','));
  const csv = [headers.join(','), ...rows2].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'processos.csv'; a.click();
  URL.revokeObjectURL(url);
}

function formatCurrency(v: number | null) {
  if (v == null) return EMPTY;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDate(s: string | null | undefined) {
  if (!s) return EMPTY;
  // Append T12:00:00 for bare date strings (YYYY-MM-DD) so UTC parsing
  // doesn't shift the date backward in Brazilian timezone (UTC-3)
  const normalized = s.includes('T') ? s : s.slice(0, 10) + 'T12:00:00';
  return new Date(normalized).toLocaleDateString('pt-BR');
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

// ── hooks ──────────────────────────────────────────────────────────────────────
function useProcesses(search: string, status: string, type: string, page: number) {
  return useQuery({
    queryKey: ['processes', search, status, type, page],
    queryFn: async () => {
      let clientIds: string[] = [];
      if (search) {
        for (let from = 0; ; from += 1000) {
          const { data: cli, error: cliError } = await supabase
            .from('clients')
            .select('id')
            .ilike('name', `%${search}%`)
            .range(from, from + 999);
          if (cliError) throw cliError;
          clientIds.push(...((cli ?? []).map((c: any) => c.id)));
          if (!cli || cli.length < 1000) break;
        }
      }
      let q = supabase
        .from('processes')
        .select(FULL_SELECT, { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (search) {
        const orParts = [
          `number.ilike.%${search}%`,
          `title.ilike.%${search}%`,
          `client_name.ilike.%${search}%`,
          `opponent.ilike.%${search}%`,
          `comarca.ilike.%${search}%`,
        ];
        if (clientIds.length) orParts.push(`client_id.in.(${clientIds.join(',')})`);
        q = q.or(orParts.join(','));
      }
      if (status) q = q.eq('status', status);
      if (type) q = q.eq('type', type);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Process[], total: count ?? 0 };
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
        .not('assignee', 'eq', 'movimentacao')
        .not('assignee', 'eq', 'documento')
        .not('assignee', 'eq', 'agenda')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
}

function useProcessTypes() {
  return useQuery<string[]>({
    queryKey: ['process-types'],
    queryFn: async () => {
      // Fetch all types efficiently using count-only approach
      const { data, error } = await supabase
        .from('processes')
        .select('type')
        .not('type', 'is', null)
        .not('type', 'eq', '')
        .limit(5000);
      if (error) throw error;
      const types = Array.from(new Set((data ?? []).map((r: any) => r.type as string).filter(Boolean))).sort();
      return types;
    },
    staleTime: 10 * 60_000, // 10 minutes cache
    gcTime: 30 * 60_000,
  });
}

// ── Process Movimentacoes (in detail panel) ─────────────────────────────────
const MOV_TIPOS: Record<string, string> = {
  despacho: 'Despacho', decisao: 'Decisão', audiencia: 'Audiência',
  sentenca: 'Sentença', recurso: 'Recurso', peticao: 'Petição',
  citacao: 'Citação', intimacao: 'Intimação', outros: 'Outros',
};
function useProcessMovimentacoes(processId: string | null) {
  return useQuery({
    queryKey: ['proc-movs', processId],
    enabled: !!processId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, due_date, created_at')
        .eq('process_id', processId!)
        .eq('assignee', 'movimentacao')
        .order('due_date', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}
function useProcessDocumentos(processId: string | null) {
  return useQuery({
    queryKey: ['proc-docs', processId],
    enabled: !!processId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, due_date, created_at')
        .eq('process_id', processId!)
        .eq('assignee', 'documento')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── ProcessForm (create + edit) ───────────────────────────────────────────────
type FormData = {
  number: string; title: string; status: string; type: string;
  client_id: string; client_name: string; comarca: string; vara: string; tribunal: string;
  opponent: string; phase: string; stage: string; responsible: string;
  lawyer: string; cause_value: string; honorarios_valor: string;
  honorarios_percent: string; contingency: string; observations: string;
  request_date: string; closing_date: string; result: string;
};

const EMPTY_FORM: FormData = {
  number: '', title: '', status: 'novo', type: '',
  client_id: '', client_name: '', comarca: '', vara: '', tribunal: '',
  opponent: '', phase: '', stage: '', responsible: '',
  lawyer: '', cause_value: '', honorarios_valor: '',
  honorarios_percent: '', contingency: '', observations: '',
  request_date: '', closing_date: '', result: '',
};

function processToForm(p: Process): FormData {
  return {
    number: p.number ?? '',
    title: p.title ?? '',
    status: p.status ?? 'novo',
    type: p.type ?? '',
    client_id: p.client_id ?? '',
    client_name: p.client_name ?? '',
    comarca: p.comarca ?? '',
    vara: p.vara ?? '',
    tribunal: p.tribunal ?? '',
    opponent: p.opponent ?? '',
    phase: p.phase ?? '',
    stage: p.stage ?? '',
    responsible: p.responsible ?? p.lawyer ?? '',
    lawyer: p.lawyer ?? '',
    cause_value: p.cause_value != null ? String(p.cause_value) : '',
    honorarios_valor: p.honorarios_valor != null ? String(p.honorarios_valor) : '',
    honorarios_percent: p.honorarios_percent != null ? String(p.honorarios_percent) : '',
    contingency: p.contingency != null ? String(p.contingency) : '',
    observations: p.observations ?? '',
    request_date: p.request_date ? p.request_date.slice(0, 10) : '',
    closing_date: p.closing_date ? p.closing_date.slice(0, 10) : '',
    result: p.result ?? '',
  };
}

function formToPayload(f: FormData) {
  return {
    number: f.number || null,
    title: f.title,
    status: f.status,
    type: f.type || null,
    client_id: f.client_id || null,
    client_name: f.client_name || null,
    comarca: f.comarca || null,
    vara: f.vara || null,
    tribunal: f.tribunal || null,
    opponent: f.opponent || null,
    phase: f.phase || null,
    stage: f.stage || null,
    responsible: f.responsible || null,
    lawyer: f.lawyer || null,
    cause_value: f.cause_value ? parseFloat(f.cause_value) : null,
    honorarios_valor: f.honorarios_valor ? parseFloat(f.honorarios_valor) : null,
    honorarios_percent: f.honorarios_percent ? parseFloat(f.honorarios_percent) : null,
    contingency: f.contingency ? parseFloat(f.contingency) : null,
    observations: f.observations || null,
    request_date: f.request_date || null,
    closing_date: f.closing_date || null,
    result: f.result || null,
    updated_at: new Date().toISOString(),
  };
}

interface ProcessFormProps {
  initialData?: Process;
  onClose: () => void;
  onSaved: (p: Process) => void;
}

function ProcessForm({ initialData, onClose, onSaved }: ProcessFormProps) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<FormData>(
    initialData ? processToForm(initialData) : EMPTY_FORM
  );
  const isEdit = !!initialData;

  // Client lookup for linking process to client
  const { data: clientList = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['client-list-proc'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name')
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const found = clientList.find(c => c.id === id);
    setForm(f => ({ ...f, client_id: id, client_name: found?.name ?? f.client_name }));
  };

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = formToPayload(form);
      if (isEdit) {
        const { data, error } = await supabase
          .from('processes')
          .update(payload as any)
          .eq('id', initialData!.id)
          .select(FULL_SELECT)
          .single();
        if (error) throw error;
        return data as unknown as Process;
      } else {
        const { data, error } = await supabase
          .from('processes')
          .insert({ ...payload, created_at: new Date().toISOString(), user_id: user?.id } as any)
          .select(FULL_SELECT)
          .single();
        if (error) throw error;
        return data as unknown as Process;
      }
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['processes'] });
      toast({ title: isEdit ? 'Processo atualizado.' : 'Processo criado.' });
      onSaved(p);
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const Field = ({ label, field, type = 'text', colSpan = 1 }: {
    label: string; field: keyof FormData; type?: string; colSpan?: number;
  }) => (
    <div className={colSpan === 2 ? 'col-span-2' : ''}>
      <Label className="text-xs text-gray-500 uppercase tracking-wide">{label}</Label>
      <Input type={type} value={form[field]} onChange={set(field)} className="mt-1" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Número" field="number" />
        <div>
          <Label className="text-xs text-gray-500 uppercase tracking-wide">Status</Label>
          <select value={form.status} onChange={set('status')}
            className="mt-1 w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white">
            {ALL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <Label className="text-xs text-gray-500 uppercase tracking-wide">Título *</Label>
        <Input value={form.title} onChange={set('title')} className="mt-1" placeholder="Título do processo" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500 uppercase tracking-wide">Cliente</Label>
          <select
            value={form.client_id}
            onChange={handleClientChange}
            className="mt-1 w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white"
          >
            <option value="">— Selecionar cliente —</option>
            {clientList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!form.client_id && (
            <Input
              className="mt-1 text-xs"
              placeholder="Ou digite o nome manualmente"
              value={form.client_name}
              onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
            />
          )}
        </div>
        <Field label="Parte Contrária" field="opponent" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo" field="type" />
        <Field label="Advogado" field="lawyer" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Comarca" field="comarca" />
        <Field label="Vara" field="vara" />
        <Field label="Tribunal" field="tribunal" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fase" field="phase" />
        <Field label="Etapa" field="stage" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Valor da Causa (R$)" field="cause_value" type="number" />
        <Field label="Honorários (R$)" field="honorarios_valor" type="number" />
        <Field label="Honorários (%)" field="honorarios_percent" type="number" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data de Entrada" field="request_date" type="date" />
        <Field label="Data de Encerramento" field="closing_date" type="date" />
      </div>

      <div>
        <Label className="text-xs text-gray-500 uppercase tracking-wide">Observações</Label>
        <Textarea value={form.observations} onChange={set('observations')} className="mt-1" rows={3} />
      </div>

      {form.status === 'concluido' || form.status === 'closed' ? (
        <div>
          <Label className="text-xs text-gray-500 uppercase tracking-wide">Resultado</Label>
          <Input value={form.result} onChange={set('result')} className="mt-1" />
        </div>
      ) : null}

      <div className="flex gap-2 pt-2 border-t">
        <Button onClick={() => save.mutate()} disabled={!form.title || save.isPending} className="flex-1">
          {save.isPending ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar Processo'}
        </Button>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Processos() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Process | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Process | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '', due_date: '' });
  const [showTaskForm, setShowTaskForm] = useState(false);

  const { data, isLoading } = useProcesses(search, statusFilter, typeFilter, page);
  const { data: processTypes = [] } = useProcessTypes();
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const { data: tasks = [] } = useProcessTasks(selected?.id ?? null);
  const { data: procMovs = [] } = useProcessMovimentacoes(selected?.id ?? null);
  const { data: procDocs = [] } = useProcessDocumentos(selected?.id ?? null);
  const [detailTab, setDetailTab] = useState<'details' | 'movs' | 'docs' | 'tasks' | 'history'>('details');

  const [isExporting, setIsExporting] = useState(false);

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      let all: Process[] = [];
      let off = 0;
      let clientIds: string[] = [];
      if (search) {
        for (let from = 0; ; from += 1000) {
          const { data: cli, error: cliError } = await supabase
            .from('clients')
            .select('id')
            .ilike('name', `%${search}%`)
            .range(from, from + 999);
          if (cliError) throw cliError;
          clientIds.push(...((cli ?? []).map((c: any) => c.id)));
          if (!cli || cli.length < 1000) break;
        }
      }
      while (true) {
        let q = supabase.from('processes').select(FULL_SELECT)
          .order('updated_at', { ascending: false })
          .range(off, off + 999);
        if (search) {
          const orParts = [
            `number.ilike.%${search}%`,
            `title.ilike.%${search}%`,
            `client_name.ilike.%${search}%`,
            `opponent.ilike.%${search}%`,
            `comarca.ilike.%${search}%`,
          ];
          if (clientIds.length) orParts.push(`client_id.in.(${clientIds.join(',')})`);
          q = q.or(orParts.join(','));
        }
        if (statusFilter) q = q.eq('status', statusFilter);
        if (typeFilter) q = q.eq('type', typeFilter);
        const { data, error } = await q;
        if (error || !data || data.length === 0) break;
        all = all.concat(data as unknown as Process[]);
        if (data.length < 1000) break;
        off += 1000;
      }
      exportToCSV(all);
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(0); }, []);
  const handleStatus = useCallback((v: string) => { setStatusFilter(v); setPage(0); }, []);
  const handleType = useCallback((v: string) => { setTypeFilter(v); setPage(0); }, []);

  // Add task to process
  const addTask = useMutation({
    mutationFn: async (payload: { title: string; description: string; due_date: string }) => {
      const { error } = await supabase.from('tasks').insert({
        ...payload,
        process_id: selected?.id,
        completed: false,
        user_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', selected?.id] });
      toast({ title: 'Andamento adicionado.' });
      setNewTask({ title: '', description: '', due_date: '' });
      setShowTaskForm(false);
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  // Delete individual andamento task
  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', selected?.id] });
      toast({ title: 'Andamento removido.' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  // Delete process
  const deleteProcess = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('processes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processes'] });
      toast({ title: 'Processo excluído.' });
      setDeleteTarget(null);
      setSelected(null);
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  // Quick status change
  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from('processes')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(FULL_SELECT)
        .single();
      if (error) throw error;
      return data as unknown as Process;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['processes'] });
      setSelected(p);
      toast({ title: `Status alterado para ${STATUS_LABELS[p.status] ?? p.status}` });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const submitTask = () => {
    if (!newTask.title.trim()) return;
    addTask.mutate(newTask);
  };

  const closeDetail = () => {
    setSelected(null);
    setEditMode(false);
    setShowTaskForm(false);
    setDetailTab('details');
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Processos{' '}
          {!isLoading && (
            <span className="text-base font-normal text-gray-500">
              ({total.toLocaleString('pt-BR')})
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportAll} disabled={isExporting}>
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exportando…' : `Exportar CSV (${total})`}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo Processo
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <SearchAutocomplete
            value={search}
            onChange={handleSearch}
            sources={['process', 'client']}
            placeholder="Buscar nº processo, cliente, CPF/CNPJ, título…"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => handleStatus(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white"
          >
            <option value="">Todos os status</option>
            {ALL_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {processTypes.length > 0 && (
            <select
              value={typeFilter}
              onChange={(e) => handleType(e.target.value)}
              className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white"
            >
              <option value="">Todos os tipos</option>
              {processTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
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
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Comarca</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => { setSelected(p); setEditMode(false); setDetailTab('details'); }}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-blue-700 whitespace-nowrap">{p.number || EMPTY}</td>
                      <td className="px-4 py-3 max-w-[220px] truncate font-medium">{p.title || EMPTY}</td>
                      <td className="px-4 py-3 max-w-[160px] truncate text-gray-600">{val(p.client_name)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{val(p.comarca)}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(p.updated_at)}</td>
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

      {/* ── Criar processo (Dialog) ── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Processo</DialogTitle>
          </DialogHeader>
          <ProcessForm
            onClose={() => setCreateOpen(false)}
            onSaved={(p) => { setCreateOpen(false); setSelected(p); }}
          />
        </DialogContent>
      </Dialog>

      {/* ── Detalhe / Edição (Sheet) ── */}
      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) closeDetail(); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <SheetTitle className="font-mono text-base">{selected.number || selected.title}</SheetTitle>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{selected.title}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setEditMode((v) => !v)}
                      className="h-8 px-2"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DeleteGuard>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => setDeleteTarget(selected)}
                        className="h-8 px-2 text-red-600 hover:text-red-700 hover:border-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </DeleteGuard>
                  </div>
                </div>
              </SheetHeader>

              {editMode ? (
                <div className="mt-4">
                  <ProcessForm
                    initialData={selected}
                    onClose={() => setEditMode(false)}
                    onSaved={(p) => { setSelected(p); setEditMode(false); }}
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {/* Tabs */}
                  <div className="flex gap-1 border-b pb-2 mb-4">
                    {([
                      { id: 'details', label: 'Detalhes' },
                      { id: 'movs',    label: `Movimentações (${procMovs.length})` },
                      { id: 'docs',    label: `Documentos (${procDocs.length})` },
                      { id: 'tasks',   label: `Andamentos (${tasks.length})` },
                      { id: 'history', label: 'Histórico' },
                    ] as { id: typeof detailTab; label: string }[]).map(({ id, label }) => (
                      <button key={id} onClick={() => { setDetailTab(id); setShowTaskForm(false); }}
                        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                          detailTab === id
                            ? 'bg-primary text-primary-foreground'
                            : 'text-gray-500 hover:bg-gray-100'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* ── Tab: Detalhes ── */}
                  {detailTab === 'details' && <div className="space-y-5">
                  {/* Status com troca rápida */}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Status</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_STATUSES.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => changeStatus.mutate({ id: selected.id, status: s.value })}
                          className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                            selected.status === s.value
                              ? `${STATUS_COLORS[s.value]} border-transparent font-semibold`
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
                          }`}
                        >
                          {s.value === selected.status && <Check className="inline h-3 w-3 mr-0.5" />}
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

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
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Responsável / Advogado</p>
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
                  </div>} {/* end details tab */}

                  {/* ── Tab: Andamentos ── */}
                  {detailTab === 'tasks' && <div>
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

                    <div className="space-y-2 max-h-52 overflow-y-auto">
                      {tasks.length === 0 ? (
                        <p className="text-xs text-gray-400">Sem andamentos registrados.</p>
                      ) : tasks.map((t) => (
                        <div key={t.id} className="text-sm border rounded-md p-2 bg-white flex items-start gap-2 group/task">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{t.title}</p>
                            {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                            {t.due_date && <p className="text-xs text-gray-400 mt-1">{formatDate(t.due_date)}</p>}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 text-red-400 opacity-0 group-hover/task:opacity-100 transition-opacity"
                            onClick={() => deleteTask.mutate(t.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>}

                  {/* ── Tab: Movimentações ── */}
                  {detailTab === 'movs' && (
                    <div className="space-y-2">
                      {procMovs.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Sem movimentações registradas para este processo.</p>
                      ) : procMovs.map((m: any) => (
                        <div key={m.id} className="border rounded-md p-3 bg-white text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                              {MOV_TIPOS[m.title] ?? m.title}
                            </span>
                            {m.due_date && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(m.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                          {m.description && <p className="text-xs text-gray-600 whitespace-pre-wrap">{m.description}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Tab: Documentos ── */}
                  {detailTab === 'docs' && (
                    <div className="space-y-2">
                      {procDocs.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Sem documentos registrados para este processo.</p>
                      ) : procDocs.map((d: any) => {
                        const sep = (d.description ?? '').indexOf('|||');
                        const url  = sep !== -1 ? d.description.substring(0, sep) : '';
                        const notes = sep !== -1 ? d.description.substring(sep + 3) : (d.description ?? '');
                        return (
                          <div key={d.id} className="border rounded-md p-3 bg-white text-sm flex items-start gap-3">
                            <FileText className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{d.title}</p>
                              {notes && <p className="text-xs text-gray-500 truncate">{notes}</p>}
                              {d.due_date && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {new Date(d.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </p>
                              )}
                            </div>
                            {url && (
                              <button
                                onClick={() => window.open(url, '_blank')}
                                className="text-xs text-blue-600 hover:underline shrink-0"
                              >
                                Abrir
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Tab: Histórico ── */}
                  {detailTab === 'history' && (
                    <div className="h-[60vh] flex flex-col">
                      <HistoricoConversas processId={selected.id} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Confirmar exclusão ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Excluir Processo
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Tem certeza que deseja excluir o processo{' '}
            <span className="font-semibold font-mono">{deleteTarget?.number || deleteTarget?.title}</span>?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteProcess.mutate(deleteTarget.id)}
              disabled={deleteProcess.isPending}
            >
              {deleteProcess.isPending ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
