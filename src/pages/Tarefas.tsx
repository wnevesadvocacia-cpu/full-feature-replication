import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ProcessSearchSelect } from '@/components/ProcessSearchSelect';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Search, Calendar, Loader2, Pencil, Trash2, AlertTriangle, Info, ArrowRight, FileText, User, Check, Paperclip, ChevronDown, Hourglass, MessageSquare, RotateCcw, XCircle,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { useTasks, useCreateTask, useUpdateTask } from '@/hooks/useTasks';
import { useCanDelete } from '@/hooks/useUserRole';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { renderSafeContent } from '@/lib/sanitizeHtml';
import { ToastAction } from '@/components/ui/toast';
import { tribunalFromCNJ, instanciaFromContext } from '@/lib/cnjTribunal';
import { useSistemaByCnj } from '@/hooks/useSistemaByCnj';
import { supabase } from '@/integrations/supabase/client';
import { confirmModal } from '@/lib/confirmModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { DeleteGuard } from '@/components/DeleteGuard';
import { HistoricoConversas } from '@/components/HistoricoConversas';
import { PRAXIS_TASK_TITLES } from '@/lib/praxisTitles';
import { attachDocumentToProcess } from '@/lib/attachDocument';
import { DateInputBR } from '@/components/DateInputBR';
import { CopyNumber } from '@/components/CopyNumber';
import { isBusinessDay, todayISO, formatBR } from '@/lib/cnjCalendar';

type TaskPriority = 'alta' | 'media' | 'baixa';
type ViewFilter = 'pendentes' | 'todas' | 'concluidas';

// Número em destaque = o CNJ diretamente relacionado à publicação (execução/
// cumprimento de sentença quando for o caso), não o processo principal vinculado.
const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
function publicationNumber(task: any): string | null {
  const desc = String(task?.description || '');
  const m = desc.match(/Processo:\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i) || desc.match(CNJ_RE);
  const num = m ? (m[1] || m[0]) : null;
  return num || task?.processes?.number || null;
}



const priorityConfig: Record<TaskPriority, { label: string; className: string }> = {
  alta: { label: 'Alta', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  media: { label: 'Média', className: 'bg-warning/10 text-warning border-warning/20' },
  baixa: { label: 'Baixa', className: 'bg-muted text-muted-foreground border-border' },
};

interface TaskForm {
  title: string; description: string; assignee: string;
  priority: string; due_date: string; start_date: string; process_id: string;
  cc_user_id: string;
}
const EMPTY_FORM: TaskForm = {
  title: '', description: '', assignee: '',
  priority: 'media', due_date: '', start_date: '', process_id: '',
  cc_user_id: '',
};

const TASK_DIALOG_CLASS = "!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-[34rem] max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6";

function decodeHtml(s: string): string {
  if (!s) return '';
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea');
    el.innerHTML = s;
    return el.value;
  }
  return s;
}

function fmtDate(s?: string) {
  if (!s) return '';
  // Datas puras YYYY-MM-DD devem ser exibidas sem conversão de fuso (evita -1 dia em BRT).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDateTime(s?: string) {
  return s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

function abbreviateName(fullName?: string | null): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const connectors = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del']);
  const significant = parts.filter(p => !connectors.has(p.toLowerCase()));
  if (significant.length === 0) return parts[0];
  if (significant.length === 1) return significant[0];
  return `${significant[0]} ${significant[significant.length - 1]}`;
}


export default function Tarefas() {
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('pendentes');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [overviewTarget, setOverviewTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: tasks = [], isLoading } = useTasks();
  
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { toast } = useToast();
  const qc = useQueryClient();
  const sistemaByCnj = useSistemaByCnj();
  const { user } = useAuth();
  const canManage = useCanDelete();

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_team_members');
      if (error) throw error;
      return (data || []) as { user_id: string; email: string; full_name?: string; roles: string[] }[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Gestores/administradores disponíveis para cópia obrigatória da tarefa.
  const supervisors = teamMembers.filter((m) =>
    (m.roles || []).some((r) => r === 'admin' || r === 'gerente')
  );

  const set = (k: keyof TaskForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const onlyDigits = (s: string) => (s || '').replace(/\D+/g, '');
  const norm = (s: string) =>
    (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  // tolera 1 erro de digitação por palavra (ex.: "nevves" -> "neves")
  const near = (a: string, b: string) => {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
    let i = 0, j = 0, diff = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (a.length === b.length) { i++; j++; }
      else if (a.length > b.length) i++;
      else j++;
    }
    return diff + (a.length - i) + (b.length - j) <= 1;
  };
  const filtered = (tasks as any[]).filter((t) => {
    const q = norm(search);
    const tokens = q.split(/\s+/).filter(Boolean);
    const matchedAssigneeEmails = teamMembers
      .filter((member) => {
        const memberText = norm([member.full_name, member.email].filter(Boolean).join(' '));
        const memberWords = memberText.split(/[^a-z0-9]+/).filter(Boolean);
        return tokens.length > 0 && tokens.every((token) =>
          memberText.includes(token) || memberWords.some((word) => near(token, word))
        );
      })
      .map((member) => norm(member.email));
    const qDigits = onlyDigits(q);
    const procNumDigits = onlyDigits(t.processes?.number || '');
    const descDigits = onlyDigits(t.description || '');
    const titleDigits = onlyDigits(t.title || '');
    const assigneeName = t.assignee
      ? teamMembers.find((m) => m.email === t.assignee)?.full_name || ''
      : '';
    const haystack = norm(
      [t.title, t.description, t.assignee, assigneeName, t.processes?.number].filter(Boolean).join(' ')
    );
    const hayWords = haystack.split(/[^a-z0-9]+/).filter(Boolean);
    const matchSearch = !q ||
      (matchedAssigneeEmails.length > 0
        ? matchedAssigneeEmails.includes(norm(t.assignee || ''))
        : tokens.every((tk) => haystack.includes(tk) || hayWords.some((w) => near(tk, w)))) ||
      (qDigits && (procNumDigits.includes(qDigits) || descDigits.includes(qDigits) || titleDigits.includes(qDigits)));
    if (!matchSearch) return false;

    if (viewFilter === 'pendentes') return !t.completed && t.status !== 'cancelada';
    if (viewFilter === 'concluidas') return t.completed && t.status !== 'cancelada';

    return true;
  }).sort((a: any, b: any) => {
    if (viewFilter === 'concluidas') {
      // Concluídas: ordenadas por data de conclusão, mais recente primeiro
      const ca = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const cb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return cb - ca;
    }
    if (viewFilter === 'todas') {
      // Todas: pendentes primeiro (por vencimento), depois concluídas (por conclusão decrescente)
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.completed) {
        const ca = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const cb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return cb - ca;
      }
    }
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return da - db;
  });

  const pendentes = (tasks as any[]).filter(t => !t.completed && t.status !== 'cancelada').length;
  const concluidas = (tasks as any[]).filter(t => t.completed && t.status !== 'cancelada').length;


  // ===== Espelho da agenda: carga de prazos pendentes por colaborador/dia =====
  const loadMap = useMemo(() => {
    const m = new Map<string, number>();
    (tasks as any[]).forEach((t) => {
      if (t.completed || !t.due_date) return;
      const key = `${t.assignee || '—'}|${String(t.due_date).slice(0, 10)}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return m;
  }, [tasks]);

  const loadDays = useMemo(() => {
    const base = new Date(todayISO() + 'T12:00:00');
    const out: string[] = [];
    for (let i = 0; i < 21 && out.length < 10; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      if (isBusinessDay(iso)) out.push(iso);
    }
    return out;
  }, []);

  const loadRows = useMemo(() => {
    const emails = new Set<string>();
    loadMap.forEach((_v, k) => {
      const [email, iso] = k.split('|');
      if (loadDays.includes(iso)) emails.add(email);
    });
    return Array.from(emails).map((email) => {
      const member = teamMembers.find((m) => m.email === email);
      const cells = loadDays.map((iso) => loadMap.get(`${email}|${iso}`) ?? 0);
      return { email, name: member?.full_name || email, cells, total: cells.reduce((a, b) => a + b, 0) };
    }).sort((a, b) => b.total - a.total);
  }, [loadMap, loadDays, teamMembers]);

  const loadCellClass = (n: number) =>
    n === 0 ? 'text-stone-300 dark:text-muted-foreground/40'
      : n <= 2 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
        : n <= 4 ? 'bg-amber-50 text-amber-700 dark:bg-warning/15 dark:text-warning'
          : 'bg-red-50 text-red-700 font-bold dark:bg-destructive/15 dark:text-destructive';


  const toggleTask = async (task: any) => {
    const willComplete = !task.completed;
    await updateTask.mutateAsync({
      id: task.id,
      completed: willComplete,
      status: willComplete ? 'concluida' : 'pendente',
    });
    toast({
      title: willComplete ? 'Prazo concluído' : 'Prazo reaberto',
      description: willComplete && viewFilter === 'pendentes'
        ? 'Ela saiu da lista de pendentes. Veja em "Concluídas" ou "Todas".'
        : undefined,
      action: (
        <ToastAction altText="Desfazer" onClick={() => {
          updateTask.mutate({
            id: task.id,
            completed: !willComplete,
            status: !willComplete ? 'concluida' : 'pendente',
          });
        }}>Desfazer</ToastAction>
      ),
    });
  };

  const setTaskStatus = async (task: any, status: string) => {
    const prevStatus = task.status;
    qc.setQueryData(['tasks'], (old: any[] | undefined) =>
      old?.map((t) => (t.id === task.id ? { ...t, status, completed: false } : t)) ?? old
    );
    try {
      await updateTask.mutateAsync({ id: task.id, status, completed: false });
      toast({
        title: status === 'em_elaboracao' ? 'Prazo em elaboração' : 'Prazo pendente',
        action: (
          <ToastAction altText="Desfazer" onClick={() => {
            updateTask.mutate({ id: task.id, status: prevStatus || 'pendente', completed: false });
          }}>Desfazer</ToastAction>
        ),
      });
    } catch (e: any) {
      qc.setQueryData(['tasks'], (old: any[] | undefined) =>
        old?.map((t) => (t.id === task.id ? { ...t, status: prevStatus || 'pendente', completed: false } : t)) ?? old
      );
      toast({ title: 'Erro ao alterar status', description: e.message, variant: 'destructive' });
    }
  };

  const cancelTask = async (task: any) => {
    const ok = await confirmModal(
      `ALERTA DE AUDITORIA\n\n` +
      `O cancelamento deste prazo será registrado permanentemente na auditoria do sistema, ` +
      `com identificação do usuário, data e hora.\n\n` +
      `Prazo: ${task.title}\n` +
      `Responsável: ${task.assignee || '—'}\n` +
      `Vencimento: ${task.due_date ? fmtDate(task.due_date) : '—'}\n\n` +
      `Use esta opção apenas em caso de prazo atribuído erroneamente. Confirmar cancelamento?`,
      { title: 'Cancelar prazo atribuído erroneamente', okLabel: 'Cancelar prazo' }
    );
    if (!ok) return;
    try {
      await updateTask.mutateAsync({ id: task.id, status: 'cancelada', completed: true });
      await (supabase as any).rpc('log_auth_event', {
        _event: 'PRAZO_CANCELADO',
        _metadata: {
          task_id: task.id,
          title: task.title,
          assignee: task.assignee,
          due_date: task.due_date,
          process_id: task.process_id,
          cancelled_at: new Date().toISOString(),
        },
      });
      toast({ title: 'Prazo cancelado', description: 'Registro mantido na auditoria do sistema.' });
    } catch (e: any) {
      toast({ title: 'Erro ao cancelar prazo', description: e.message, variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    if (!form.process_id) { toast({ title: 'Selecione o processo vinculado', description: 'Escolha o processo na lista de sugestões para permitir a checagem de duplicidade.', variant: 'destructive' }); return; }
    if (!form.assignee.trim()) { toast({ title: 'Selecione o responsável', variant: 'destructive' }); return; }
    if (!form.cc_user_id) { toast({ title: 'Selecione o gestor em cópia', description: 'É obrigatório enviar cópia do prazo a um gestor/administrador.', variant: 'destructive' }); return; }
    if (!form.due_date) { toast({ title: 'Informe o prazo final', description: 'O prazo final (vencimento) é obrigatório para registrar a prazo.', variant: 'destructive' }); return; }
    // Verificação de duplicidade — consulta o banco no submit para não depender
    // do cache do React Query (evita falso-negativo se o cache estiver defasado).
    if (form.process_id) {
      const { data: pend } = await supabase
        .rpc('list_pending_tasks_for_process', { _process_id: form.process_id });
      const dups = (pend ?? []) as any[];
      if (dups.length > 0) {
        const ok = await confirmModal(
          `Já existe(m) ${dups.length} prazo(s) pendente(s) neste processo:\n\n` +
          dups.slice(0, 5).map((t: any) => `• ${t.title}${t.due_date ? ` (prazo ${fmtDate(t.due_date)})` : ''}`).join('\n') +
          `\n\nDeseja mesmo criar outra prazo neste processo?`,
          { title: 'Prazos pendentes neste processo', okLabel: 'Criar mesmo assim' }
        );
        if (!ok) return;
      }
    }
    setSaving(true);
    try {
      await createTask.mutateAsync({
        title: form.title,
        description: form.description || undefined,
        assignee: form.assignee.trim(),
        priority: form.priority,
        due_date: form.due_date || undefined,
        start_date: form.start_date || undefined,
        process_id: form.process_id || undefined,
      });
      await (supabase as any).rpc('notify_task_cc', {
        _cc_user_id: form.cc_user_id,
        _title: form.title,
        _assignee: form.assignee.trim(),
        _due_date: form.due_date || null,
        _process_number: null,
      });

      setCreateOpen(false);
      setForm(EMPTY_FORM);
      toast({ title: 'Prazo criado!', description: 'Cópia enviada ao gestor selecionado.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editTarget || !form.title.trim()) return;
    if (!form.assignee.trim()) { toast({ title: 'Selecione o responsável', variant: 'destructive' }); return; }
    if (!form.cc_user_id) { toast({ title: 'Selecione o gestor em cópia', description: 'É obrigatório enviar cópia da alteração a um gestor/administrador.', variant: 'destructive' }); return; }
    if (!form.due_date) { toast({ title: 'Informe o prazo final', description: 'O prazo final (vencimento) é obrigatório.', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').update({
        title: form.title,
        description: form.description || null,
        assignee: form.assignee.trim(),
        priority: form.priority,
        due_date: form.due_date || null,
        start_date: form.start_date || null,
        process_id: form.process_id || null,
      }).eq('id', editTarget.id);
      if (error) throw error;
      await (supabase as any).rpc('notify_task_cc', {
        _cc_user_id: form.cc_user_id,
        _title: form.title,
        _assignee: form.assignee.trim(),
        _due_date: form.due_date || null,
        _process_number: editTarget.processes?.number ?? null,
      });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setEditTarget(null);
      toast({ title: 'Prazo atualizado!', description: 'Cópia enviada ao gestor selecionado.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const backup = deleteTarget;
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', backup.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setDeleteTarget(null);
      toast({
        title: 'Prazo excluído.',
        action: (
          <ToastAction altText="Desfazer" onClick={async () => {
            const { processes, ...row } = backup;
            const { error: restoreErr } = await supabase.from('tasks').insert(row);
            if (restoreErr) {
              toast({ title: 'Erro ao desfazer', description: restoreErr.message, variant: 'destructive' });
              return;
            }
            qc.invalidateQueries({ queryKey: ['tasks'] });
            toast({ title: 'Exclusão desfeita.' });
          }}>Desfazer</ToastAction>
        ),
      });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const [attachTarget, setAttachTarget] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);

  const openAttach = (task: any) => {
    if (!task.process_id) {
      toast({ title: 'Vincule um processo à prazo antes de anexar documentos.', variant: 'destructive' });
      return;
    }
    setAttachTarget(task);
    setTimeout(() => attachInputRef.current?.click(), 0);
  };

  const handleAttachFile = async (file: File | null) => {
    const task = attachTarget;
    if (!file || !task || !user) { setAttachTarget(null); return; }
    setUploading(true);
    try {
      await attachDocumentToProcess({
        userId: user.id,
        file,
        processId: task.process_id,
        description: `Anexo do prazo: ${task.title}`,
        category: 'tarefa',
      });
      toast({ title: 'Documento anexado!', description: 'Vinculado ao processo/cliente.' });
      qc.invalidateQueries({ queryKey: ['documentos'] });
    } catch (e: any) {
      toast({ title: 'Erro ao anexar', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setAttachTarget(null);
      if (attachInputRef.current) attachInputRef.current.value = '';
    }
  };

  // Aviso de possível duplicidade: tarefas pendentes já cadastradas no mesmo processo.
  const [duplicateHint, setDuplicateHint] = useState<any[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!form.process_id) { setDuplicateHint(null); return; }
    supabase.rpc('list_pending_tasks_for_process', { _process_id: form.process_id })
      .then(({ data }) => {
        if (cancelled) return;
        const list = (data ?? []).filter((t: any) => t.id !== editTarget?.id);
        setDuplicateHint(list.length > 0 ? list : null);
      });
    return () => { cancelled = true; };
  }, [form.process_id, editTarget?.id]);

  const openEdit = (t: any) => {
    setForm({
      title: t.title ?? '',
      description: decodeHtml(t.description ?? ''),
      assignee: t.assignee ?? '',
      priority: t.priority ?? 'media',
      due_date: t.due_date ? t.due_date.slice(0, 10) : '',
      start_date: t.start_date ? t.start_date.slice(0, 10) : '',
      process_id: t.process_id ?? '',
      cc_user_id: '',
    });
    setEditTarget(t);
  };

  if (isLoading) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const taskFormFields = (
    <div className="space-y-4">
      <div
        role="alert"
        className="rounded-md border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-400 p-3 text-[12px] leading-relaxed text-amber-900 dark:text-amber-100"
      >
        <p className="font-semibold mb-1">⚠ Atenção ao prazo fatal</p>
        <p>
          Registre o prazo, preferencialmente, com <strong>no mínimo 2 (dois) dias úteis de antecedência</strong> ao prazo fatal.
          Confira a data no ato judicial e faça <strong>dupla verificação</strong> (contagem em dias úteis, feriados locais e suspensões do tribunal).
          <strong> Perda de prazo = perda do processo</strong>, com consequências disciplinares e indenizatórias.
        </p>
      </div>
      <div>
        <Label>Processo vinculado *</Label>
        <ProcessSearchSelect
          value={form.process_id}
          onChange={(id) => setForm(f => ({ ...f, process_id: id }))}
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Comece pelo processo: digite o número ou CPF/CNPJ do cliente.
        </p>
        {duplicateHint && (
          <div className="mt-2 rounded-md border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-[12px] text-amber-900 dark:text-amber-100">
            <p className="font-semibold flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Possível duplicidade</p>
            <p className="mt-1">
              Já existe(m) <strong>{duplicateHint.length}</strong> prazo(s) pendente(s) neste processo:
            </p>
            <ul className="mt-1 list-disc list-inside space-y-0.5">
              {duplicateHint.slice(0, 3).map((t: any) => (
                <li key={t.id} className="truncate">
                  “{t.title}”{t.due_date ? ` — prazo ${fmtDate(t.due_date)}` : ''}
                </li>
              ))}
              {duplicateHint.length > 3 && <li>+ {duplicateHint.length - 3} outra(s)…</li>}
            </ul>
          </div>
        )}
      </div>
      <div>
        <Label>Título *</Label>
        <Input
          className="mt-1"
          value={form.title}
          onChange={set('title')}
          placeholder="Digite ou selecione abaixo"
          list="praxis-titles-tarefas"
        />
        <datalist id="praxis-titles-tarefas">
          {PRAXIS_TASK_TITLES.map((t) => <option key={t} value={t} />)}
        </datalist>
        <div className="mt-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {PRAXIS_TASK_TITLES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((f) => ({ ...f, title: t }))}
              className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                form.title === t
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 hover:bg-muted text-foreground border-border'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Selecione um título da praxis ou digite um personalizado.
        </p>
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea className="mt-1" value={form.description} onChange={set('description')} rows={2} placeholder="Detalhes do prazo" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Responsável *</Label>
          <select
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm h-10"
            value={form.assignee}
            onChange={set('assignee')}
            required
          >
            <option value="">— Selecione —</option>
            {teamMembers.map((m) => (
              <option key={m.user_id} value={m.email}>{m.email}</option>
            ))}
            {form.assignee && !teamMembers.some((m) => m.email === form.assignee) && (
              <option value={form.assignee}>{form.assignee}</option>
            )}
          </select>
        </div>
        <div>
          <Label>Prioridade</Label>
          <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={form.priority} onChange={set('priority')}>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </select>
        </div>
      </div>
      <div>
        <Label>Com cópia para (gestor/administrador) *</Label>
        <select
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm h-10"
          value={form.cc_user_id}
          onChange={set('cc_user_id')}
          required
        >
          <option value="">— Selecione —</option>
          {supervisors.map((m) => (
            <option key={m.user_id} value={m.user_id} title={`${m.full_name || m.email} (${m.email})`}>
              {m.full_name ? `${m.full_name} (${m.email})` : m.email}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground mt-1">
          Obrigatório: o gestor selecionado receberá notificação imediata deste prazo.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-primary" /> Data inicial
          </Label>
          <DateInputBR className="mt-1" value={form.start_date} onChange={(v) => set('start_date')({ target: { value: v } } as any)} />
          <p className="text-[11px] text-muted-foreground mt-1">
            Aparece na agenda a partir desta data e permanece até ser concluída.
          </p>
        </div>
        <div>
          <Label className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-destructive" /> Prazo final *
          </Label>
          <DateInputBR className="mt-1" value={form.due_date} onChange={(v) => set('due_date')({ target: { value: v } } as any)} />
          {form.assignee && form.due_date && (() => {
            const n = loadMap.get(`${form.assignee}|${form.due_date.slice(0, 10)}`) ?? 0;
            return (
              <p className={`text-[11px] mt-1 ${n >= 3 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                {n === 0
                  ? 'Nenhum prazo pendente do responsável nesta data.'
                  : `${n} prazo(s) pendente(s) do responsável nesta data${n >= 3 ? ' — considere outra data para evitar acúmulo.' : '.'}`}
              </p>
            );
          })()}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F9F7F2] dark:bg-background p-6 sm:p-8 animate-fade-in">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        {/* Header */}
        <header className="flex items-end justify-between border-b border-stone-200 dark:border-border pb-6">
          <div className="space-y-1">
            <h1 className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-stone-900 dark:text-foreground">
              Prazos
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-muted-foreground font-medium tracking-wide uppercase">
              <span className="text-stone-900 dark:text-foreground">{pendentes} pendentes</span> · {concluidas} concluídas
            </p>
          </div>
          <Button
            onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}
            className="rounded-sm shadow-xl"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Novo Prazo
          </Button>
        </header>

        {/* Banner de alerta piscante para prazos próximos */}
        {(() => {
          const today = new Date();
          today.setHours(0,0,0,0);
          const urgentTasks = (tasks as any[]).filter((t: any) => {
            if (!t.due_date || t.completed) return false;
            const due = new Date(t.due_date.slice(0,10) + 'T12:00:00');
            due.setHours(0,0,0,0);
            const daysLeft = Math.ceil((due.getTime() - today.getTime()) / (1000*60*60*24));
            return daysLeft <= 2;
          }).sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
          if (urgentTasks.length === 0) return null;
          const nearest = urgentTasks[0];
          const due = new Date(nearest.due_date.slice(0,10) + 'T12:00:00');
          due.setHours(0,0,0,0);
          const daysLeft = Math.ceil((due.getTime() - today.getTime()) / (1000*60*60*24));
          return (
            <div className="relative overflow-hidden bg-red-50/60 dark:bg-destructive/10 border-l-2 border-red-500 dark:border-destructive p-5 rounded-r-lg">
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-red-600 dark:text-destructive" />
                <div>
                  <p className="text-sm text-red-900 dark:text-destructive font-semibold">
                    {urgentTasks.length === 1
                      ? `"${nearest.title}" — atenção ao prazo`
                      : `${urgentTasks.length} prazos próximos do vencimento`}
                  </p>
                  <p className="text-xs text-red-700 dark:text-destructive/80 mt-1 opacity-90 italic">
                    A mais urgente: "{nearest.title}" {daysLeft < 0 ? `vencida há ${Math.abs(daysLeft)} dia(s)` : daysLeft === 0 ? 'vence hoje' : daysLeft === 1 ? 'vence amanhã' : `vence em ${daysLeft} dias`} — {fmtDate(nearest.due_date)}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          <form
            className="relative w-full max-w-md group"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchDraft.trim());
              setViewFilter('todas');
            }}
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Buscar título, responsável ou nº do processo…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="w-full bg-white dark:bg-card border border-stone-200 dark:border-border pl-11 pr-12 py-3 h-auto rounded-full text-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary placeholder:text-stone-400"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Buscar prazos"
              title="Buscar"
              className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
            >
              <Search className="h-4 w-4" />
            </Button>
          </form>
          <div className="flex p-1 bg-stone-200/50 dark:bg-muted rounded-full self-start md:self-auto" role="group" aria-label="Filtrar prazos por situação">
            {([
              { v: 'pendentes', l: 'Pendentes', count: pendentes },
              { v: 'todas', l: 'Todas', count: pendentes + concluidas },
              { v: 'concluidas', l: 'Concluídas', count: concluidas },
            ] as { v: ViewFilter; l: string; count: number }[]).map(({ v, l, count }) => (
              <Button
                key={v}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewFilter(v)}
                aria-pressed={viewFilter === v}
                className={`h-9 px-4 text-[11px] font-bold uppercase tracking-widest rounded-full transition-all ${
                  viewFilter === v
                    ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground'
                    : 'text-stone-500 dark:text-muted-foreground hover:text-stone-800 dark:hover:text-foreground'
                }`}
              >
                {l} <span className={`ml-2 tabular-nums ${viewFilter === v ? 'text-primary-foreground' : 'text-stone-400 dark:text-muted-foreground'}`}>{count}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-stone-200 dark:border-border bg-white/50 dark:bg-card/40 px-3 py-2 text-xs text-stone-500 dark:text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
          <p className="leading-relaxed">
            Esta busca lista os prazos da situação selecionada: <span className="font-medium text-stone-800 dark:text-foreground">{viewFilter === 'pendentes' ? 'pendentes' : viewFilter === 'concluidas' ? 'concluídos' : 'todos'}</span>.
            Para buscar todos os processos,{" "}
            <Link to="/processos" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
              acesse Processos <ArrowRight className="h-3 w-3" />
            </Link>.
          </p>
        </div>

        {/* Espelho da agenda: carga de prazos pendentes por colaborador/dia */}
        {loadRows.length > 0 && (
          <div className="rounded-lg border border-stone-200 dark:border-border bg-white dark:bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200 dark:border-border">
              <Calendar className="h-4 w-4 text-primary" />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-stone-600 dark:text-muted-foreground">
                Carga de prazos por colaborador (próximos dias úteis)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-stone-50 dark:bg-muted/40">
                    <th className="text-left font-semibold px-4 py-2 text-stone-600 dark:text-muted-foreground">Responsável</th>
                    {loadDays.map((iso) => (
                      <th key={iso} className="px-2 py-2 text-center font-semibold text-stone-600 dark:text-muted-foreground whitespace-nowrap">
                        {formatBR(iso).slice(0, 5)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-semibold text-stone-600 dark:text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {loadRows.map((row) => (
                    <tr key={row.email} className="border-t border-stone-100 dark:border-border/60">
                      <td className="px-4 py-2 max-w-[220px] truncate text-stone-800 dark:text-foreground" title={row.email}>{row.name}</td>
                      {row.cells.map((n, i) => (
                        <td key={loadDays[i]} className="px-1 py-1 text-center">
                          <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-1 tabular-nums ${loadCellClass(n)}`}>
                            {n || '·'}
                          </span>
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-bold tabular-nums text-stone-900 dark:text-foreground">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-[11px] text-stone-500 dark:text-muted-foreground border-t border-stone-100 dark:border-border/60">
              Verde: até 2 prazos · Âmbar: 3-4 · Vermelho: 5 ou mais no mesmo dia.
            </p>
          </div>
        )}

        {/* Lista */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-stone-500 dark:text-muted-foreground">
            <p className="font-serif text-2xl text-stone-700 dark:text-foreground">Nenhum prazo encontrada</p>
            <p className="text-sm mt-2 italic">
              {search
                ? 'A busca filtra prazos já criados. Para vincular a um processo, clique em "Novo Prazo".'
                : 'Crie sua primeiro prazo clicando em "Novo Prazo".'}
            </p>
            {search && (
              <Button className="mt-4" size="sm" onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Novo Prazo
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((task: any) => {
              const memberById = new Map(teamMembers.map(m => [m.user_id, m.email]));
              const creatorLabel = memberById.get(task.created_by) || memberById.get(task.user_id) || '—';
              const completerLabel = task.completed_by ? (memberById.get(task.completed_by) || '—') : null;
              const dueDate = task.due_date ? new Date(task.due_date.slice(0,10) + 'T12:00:00') : null;
              const today = new Date();
              today.setHours(0,0,0,0);
              const dueDay = dueDate ? new Date(dueDate) : null;
              if (dueDay) dueDay.setHours(0,0,0,0);
              const daysLeft = dueDay ? Math.ceil((dueDay.getTime() - today.getTime()) / (1000*60*60*24)) : null;
              const showDeadlineAlert = !task.completed && dueDay && daysLeft !== null && daysLeft <= 2;
              const member = task.assignee ? teamMembers.find(m => m.email === task.assignee) : null;
              const short = member?.full_name ? abbreviateName(member.full_name) : '';
              const initials = (member?.full_name || task.assignee || '?')
                .replace(/@.*/, '')
                .split(/[\s.]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p: string) => p[0]?.toUpperCase())
                .join('');
              const stripeClass = task.completed
                ? 'bg-stone-300 dark:bg-muted'
                : daysLeft !== null && daysLeft < 0
                  ? 'bg-red-500'
                  : daysLeft !== null && daysLeft <= 2
                    ? 'bg-amber-400'
                    : 'bg-primary';
              return (
                <div
                  key={task.id}
                  data-task-state={task.completed ? 'concluida' : 'pendente'}
                  className={`group bg-white dark:bg-card border shadow-sm hover:shadow-xl hover:shadow-stone-200/50 dark:hover:shadow-black/20 transition-all duration-300 rounded-xl overflow-hidden ${task.completed ? 'border-success/30 bg-success/5' : 'border-stone-200 dark:border-border hover:border-primary/40'}`}
                >
                  <div className="flex">
                    <div className={`w-1.5 shrink-0 ${stripeClass}`} aria-hidden />
                    <div className="flex-1 min-w-0 p-5 sm:p-6">
                      {/* Linha superior: identificação + situação */}
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3 flex-wrap min-w-0">
                          {publicationNumber(task) && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setOverviewTarget(task)}
                                title="Ver detalhes do prazo"
                                className="inline-flex items-center gap-2 w-fit text-[13px] sm:text-sm font-mono font-semibold tracking-tight text-stone-700 dark:text-foreground bg-stone-50 dark:bg-muted/40 hover:bg-primary/10 border border-stone-200 dark:border-border hover:border-primary/40 rounded-md px-3 py-1.5 transition-colors"
                              >
                                <FileText className="h-4 w-4 text-primary/70" />
                                {publicationNumber(task)}
                              </button>
                              <CopyNumber number={publicationNumber(task)!} className="p-1.5 rounded-md hover:bg-primary/10" />
                            </div>

                          )}
                          {(() => {
                            // Fallback: tenta extrair CNJ do título/descrição quando não há processo vinculado
                            const rawText = `${task.processes?.number || ''} ${task.title || ''} ${task.description || ''}`;
                            const digitsMatch = rawText.replace(/[^\d-.\s]/g, ' ').match(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}|\d{20}/);
                            const cnjCandidate = publicationNumber(task) || (digitsMatch ? digitsMatch[0] : null);
                            const baseTrib = tribunalFromCNJ(cnjCandidate, rawText);
                            const sisAgg = sistemaByCnj(cnjCandidate, (task as any).location);
                            const trib = baseTrib && sisAgg && sisAgg !== baseTrib.sistema
                              ? { ...baseTrib, sistema: sisAgg, sistemasAlternativos: [baseTrib.sistema, ...(baseTrib.sistemasAlternativos || [])].filter((x): x is string => !!x && x !== sisAgg) }
                              : baseTrib;
                            if (!trib || !trib.cnjValido) return null;
                            const inst = instanciaFromContext(cnjCandidate, `${(task as any).location || ''} ${rawText}`);
                            return (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  title={trib.nome}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-primary/30 bg-primary/5 text-primary"
                                >
                                  {trib.sigla}{trib.uf && trib.sigla.indexOf(trib.uf) === -1 ? ` · ${trib.uf}` : ''}
                                </span>
                                {trib.sistema && (
                                  <span
                                    title={trib.sistemasAlternativos?.length ? `Também em uso: ${trib.sistemasAlternativos.join(', ')}` : 'Sistema de tramitação eletrônica'}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30"
                                  >
                                    {trib.sistema}
                                  </span>
                                )}
                                {inst && (
                                  <span
                                    title="Instância atual conforme a publicação"
                                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30"
                                  >
                                    {inst}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded-full border ${task.status === 'cancelada' ? 'bg-destructive/10 text-destructive border-destructive/30' : task.completed ? 'bg-success/10 text-success border-success/30' : 'bg-info/10 text-info border-info/30'}`}>
                            {task.status === 'cancelada' ? <X className="h-3 w-3" /> : task.completed ? <Check className="h-3 w-3" /> : <Hourglass className="h-3 w-3" />}
                            {task.status === 'cancelada' ? 'Cancelado' : task.completed ? 'Concluído' : 'Pendente'}
                          </span>

                          {task.status === 'em_elaboracao' && !task.completed && (
                            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-tighter rounded-full border shadow-gold bg-warning text-warning-foreground border-warning dark:bg-warning dark:text-warning-foreground dark:border-warning">
                              <span className="h-2 w-2 rounded-full bg-warning-foreground animate-pulse" />
                              Em elaboração
                            </span>
                          )}
                          {showDeadlineAlert && (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-tighter rounded-full border ${daysLeft! < 0 ? 'bg-red-50 text-red-600 border-red-100 dark:bg-destructive/10 dark:text-destructive dark:border-destructive/30' : 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-warning/10 dark:text-warning dark:border-warning/30'}`}>
                              <AlertTriangle className="h-3 w-3" />
                              {daysLeft! < 0 ? `Vencida há ${Math.abs(daysLeft!)} dia(s)` : daysLeft === 0 ? 'Vence hoje' : `Vence em ${daysLeft} dia(s)`}
                            </span>
                          )}
                          <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-tighter rounded-full border ${priorityConfig[task.priority as TaskPriority]?.className || 'bg-stone-50 text-stone-400 border-stone-100'}`}>
                            Prioridade {priorityConfig[task.priority as TaskPriority]?.label || task.priority}
                          </span>
                        </div>
                      </div>

                      {/* Conteúdo principal */}
                      <div className="mb-5">
                        <h3 className={`text-lg sm:text-xl font-extrabold text-stone-900 dark:text-foreground group-hover:text-primary transition-colors ${task.completed ? 'line-through' : ''}`}>
                          {task.title}
                        </h3>
                        {task.description && (() => {
                          const r = renderSafeContent(task.description);
                          return r.html
                            ? <div className="mt-2 text-sm text-stone-500 dark:text-muted-foreground leading-relaxed max-w-2xl line-clamp-2" dangerouslySetInnerHTML={{ __html: r.html }} />
                            : <p className="mt-2 text-sm text-stone-500 dark:text-muted-foreground leading-relaxed max-w-2xl line-clamp-2">{decodeHtml(r.text || '')}</p>;
                        })()}
                        <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-stone-400 dark:text-muted-foreground/80">
                          <span>Criada por {creatorLabel}</span>
                          <span className="h-1 w-1 rounded-full bg-stone-300 dark:bg-muted" />
                          <span>{fmtDate(task.created_at)}</span>
                          {task.completed && completerLabel && (
                            <>
                              <span className="h-1 w-1 rounded-full bg-stone-300 dark:bg-muted" />
                              <span>Concluída por {completerLabel} em {fmtDateTime(task.completed_at)}</span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* Rodapé: dados-chave + ações */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-5 border-t border-stone-100 dark:border-border">
                        {task.due_date && (
                          <div className="lg:col-span-3 flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${daysLeft !== null && daysLeft < 0 ? 'bg-red-50 text-red-600 dark:bg-destructive/10 dark:text-destructive' : daysLeft !== null && daysLeft <= 2 ? 'bg-amber-50 text-amber-700 dark:bg-warning/10 dark:text-warning' : 'bg-primary/10 text-primary'}`}>
                              <Calendar className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-muted-foreground">Vencimento</p>
                              <p className={`text-sm font-bold ${showDeadlineAlert ? (daysLeft! < 0 ? 'text-red-600 dark:text-destructive' : 'text-amber-700 dark:text-warning') : 'text-stone-900 dark:text-foreground'}`}>
                                {fmtDate(task.due_date)}
                              </p>
                            </div>
                          </div>
                        )}
                        {task.assignee && (
                          <div className="lg:col-span-5 flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-stone-900 dark:bg-foreground text-white dark:text-background flex items-center justify-center text-xs font-bold ring-2 ring-offset-2 ring-stone-100 dark:ring-border dark:ring-offset-card">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-muted-foreground">Responsável</p>
                              {short && <p className="text-sm font-bold text-stone-900 dark:text-foreground leading-tight">{short}</p>}
                              <p className="text-[11px] text-stone-500 dark:text-muted-foreground leading-tight truncate">{task.assignee}</p>
                            </div>
                          </div>
                        )}
                        <div className="lg:col-span-4 lg:ml-auto flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-stone-400 hover:text-primary hover:bg-stone-50 dark:hover:bg-muted/40 rounded-lg transition-colors disabled:opacity-40"
                            onClick={() => openAttach(task)}
                            disabled={uploading || !task.process_id}
                            title={task.process_id ? 'Anexar documento ao processo/cliente' : 'Vincule um processo para anexar'}
                          >
                            <Paperclip className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-stone-400 hover:text-stone-900 dark:hover:text-foreground hover:bg-stone-50 dark:hover:bg-muted/40 rounded-lg transition-colors"
                            onClick={() => openEdit(task)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!task.completed && (
                            <div className="flex items-stretch ml-1">
                              <Button
                                size="sm"
                                className="px-5 py-2.5 h-auto text-[11px] font-bold uppercase tracking-widest bg-stone-900 hover:bg-stone-800 text-white dark:bg-foreground dark:text-background dark:hover:bg-foreground/90 rounded-lg rounded-r-none transition-all"
                                onClick={() => toggleTask(task)}
                                disabled={updateTask.isPending}
                                title="Concluir prazo (mantida no histórico para auditoria)"
                              >
                                <Check className="h-3.5 w-3.5 mr-1.5" /> Concluir
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    className="px-3 py-2.5 h-auto bg-stone-900 hover:bg-stone-800 text-white dark:bg-foreground dark:text-background dark:hover:bg-foreground/90 border-l border-white/15 dark:border-background/20 rounded-lg rounded-l-none transition-all"
                                    disabled={updateTask.isPending}
                                    title="Mais opções de status"
                                  >
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => toggleTask(task)}>
                                    <Check className="h-3.5 w-3.5 mr-2" /> Concluir
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setTaskStatus(task, task.status === 'em_elaboracao' ? 'pendente' : 'em_elaboracao')}
                                    className={task.status === 'em_elaboracao' ? 'bg-amber-50 text-amber-700 dark:bg-warning/10 dark:text-warning' : ''}
                                  >
                                    {task.status === 'em_elaboracao' ? (
                                      <>
                                        <RotateCcw className="h-3.5 w-3.5 mr-2" /> Remover "em elaboração"
                                      </>
                                    ) : (
                                      <>
                                        <Hourglass className="h-3.5 w-3.5 mr-2" /> Em elaboração
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => cancelTask(task)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <XCircle className="h-3.5 w-3.5 mr-2" /> Cancelar prazo (erro de atribuição)
                                  </DropdownMenuItem>

                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                          {task.completed && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-10 px-4 ml-1 rounded-lg text-[11px] font-bold uppercase tracking-widest border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-border dark:text-foreground dark:hover:bg-muted/40"
                              onClick={() => toggleTask(task)}
                              disabled={updateTask.isPending}
                              title="Reabrir prazo (desfazer conclusão)"
                            >
                              <RotateCcw className="h-4 w-4 mr-1.5" /> Reabrir
                            </Button>
                          )}


                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );

            })}
          </div>
        )}
      </div>
      <input
        ref={attachInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleAttachFile(e.target.files?.[0] ?? null)}
      />





      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className={TASK_DIALOG_CLASS}>
          <DialogHeader><DialogTitle>Novo Prazo</DialogTitle></DialogHeader>
          {taskFormFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.title.trim() || !form.assignee.trim() || !form.cc_user_id || !form.due_date || saving}>
              {saving ? 'Salvando…' : 'Criar Prazo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>Editar Prazo</span>
              {editTarget?.processes?.number && (
                <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold px-3 py-1 rounded-md bg-primary/10 text-primary border border-primary/30">
                  <FileText className="h-3.5 w-3.5" />
                  {editTarget.processes.number}
                  <CopyNumber number={editTarget.processes.number} iconClassName="h-3 w-3" className="ml-0.5 p-1 rounded hover:bg-primary/20" />
                </span>
              )}
              {editTarget?.assignee && (
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border">
                  {editTarget.assignee}
                </span>
              )}
              {editTarget?.due_date && (
                <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                  Prazo: {new Date(editTarget.due_date.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
              )}
              {editTarget?.priority && (
                <Badge variant="outline" className={priorityConfig[editTarget.priority as TaskPriority]?.className || ''}>
                  {priorityConfig[editTarget.priority as TaskPriority]?.label || editTarget.priority}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-6 flex-1 overflow-hidden">
            <div className="overflow-y-auto pr-2 py-1">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Dados do prazo
              </div>
              {taskFormFields}
            </div>
            <div className="border-l md:pl-4 flex flex-col overflow-hidden min-h-[400px]">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" /> Histórico de conversas
              </div>
              {editTarget?.id && (
                <div className="flex-1 overflow-hidden">
                  <HistoricoConversas taskId={editTarget.id} processId={editTarget.process_id ?? undefined} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="border-t pt-3">
            {!canManage && (
              <p className="text-xs text-muted-foreground mr-auto">
                Apenas administradores e gerentes podem salvar alterações.
              </p>
            )}
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!form.title.trim() || !form.assignee.trim() || !form.cc_user_id || !form.due_date || saving || !canManage}>
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
              <AlertTriangle className="h-5 w-5" /> Excluir Prazo
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Excluir <span className="font-semibold">"{deleteTarget?.title}"</span>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Overview Dialog (read-only) */}
      <Dialog open={!!overviewTarget} onOpenChange={(o) => { if (!o) setOverviewTarget(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" /> {overviewTarget?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
          {overviewTarget && (() => {
            const t = overviewTarget;
            const dueDate = t.due_date ? new Date(t.due_date.slice(0,10) + 'T12:00:00') : null;
            const today = new Date();
            today.setHours(0,0,0,0);
            const dueDay = dueDate ? new Date(dueDate) : null;
            if (dueDay) dueDay.setHours(0,0,0,0);
            const daysLeft = dueDay ? Math.ceil((dueDay.getTime() - today.getTime()) / (1000*60*60*24)) : null;
            const isOverdue = daysLeft !== null && daysLeft < 0 && !t.completed;
            const isToday = daysLeft === 0 && !t.completed;
            const memberById = new Map(teamMembers.map(m => [m.user_id, m.email]));
            const creatorLabel = memberById.get(t.created_by) || memberById.get(t.user_id) || '—';
            const completerLabel = t.completed_by ? (memberById.get(t.completed_by) || '—') : null;
            return (
              <div className="space-y-3 text-sm">
                {publicationNumber(t) && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Processo:</span>
                    <span className="inline-flex items-center gap-1.5 font-mono text-base font-semibold px-3 py-1 rounded-md bg-primary/10 text-primary border border-primary/30">
                      <FileText className="h-4 w-4" />
                      {publicationNumber(t)}
                    </span>
                    <CopyNumber number={publicationNumber(t)!} className="p-1.5 rounded-md hover:bg-primary/10" />
                  </div>

                )}
                {t.description && (() => {
                  const r = renderSafeContent(t.description);
                  return r.html
                    ? <div className="bg-muted/40 rounded-md p-3 text-sm break-words prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: r.html }} />
                    : <div className="bg-muted/40 rounded-md p-3 text-sm whitespace-pre-wrap">{decodeHtml(r.text || '')}</div>;
                })()}
                <div className="grid grid-cols-2 gap-3">
                  {t.assignee && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{t.assignee}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={priorityConfig[t.priority as TaskPriority]?.className || ''}>
                      {priorityConfig[t.priority as TaskPriority]?.label || t.priority}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {t.start_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-500" />
                      <span>Início: {fmtDate(t.start_date)}</span>
                    </div>
                  )}
                  {t.due_date && (
                    <div className={`flex items-center gap-2 ${isOverdue || isToday ? 'text-destructive font-semibold' : ''}`}>
                      <Calendar className={`h-4 w-4 ${isOverdue || isToday ? 'text-destructive' : 'text-red-500'}`} />
                      <span>Prazo: {new Date(t.due_date.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      {isOverdue && <span className="text-[11px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">Vencida</span>}
                      {isToday && <span className="text-[11px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">Vence hoje</span>}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
                  <p>Criada por <span className="font-medium">{creatorLabel}</span> em {fmtDate(t.created_at)}</p>
                  {t.completed && completerLabel && (
                    <p className="mt-0.5">Concluída por <span className="font-medium">{completerLabel}</span> em {fmtDateTime(t.completed_at)}</p>
                  )}
                </div>
              </div>
            );
          })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverviewTarget(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
