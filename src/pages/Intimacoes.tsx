import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Trash2, CheckSquare, Bell, RefreshCw, ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, Highlighter, FileText, Calendar, Info } from 'lucide-react';
import { CopyNumber } from '@/components/CopyNumber';
import { useToast } from '@/hooks/use-toast';
import { isBusinessDay, previousBusinessDay, nextBusinessDay, formatBR, todayISO } from '@/lib/cnjCalendar';
import { addBusinessDays, detectDeadline } from '@/lib/legalDeadlines';
import { renderSafeContent } from '@/lib/sanitizeHtml';
import { useDeadlineReconciliation } from '@/hooks/useDeadlineReconciliation';
import { DeadlineBadge } from '@/components/DeadlineBadge';
import { DeadlinePanel } from '@/components/DeadlinePanel';
import { tribunalFromCNJ } from '@/lib/cnjTribunal';
import { useSistemaByCnj } from '@/hooks/useSistemaByCnj';
import { DeleteGuard } from '@/components/DeleteGuard';
import { hasCnj, extractCnjs } from '@/lib/cnjRegex';
import { confirmModal } from '@/lib/confirmModal';
import { useTasks } from '@/hooks/useTasks';

// Detecta sub-incidente do tipo "<CNJ>/NN" (precatório, cumprimento, incidente).
// Retorna o número efetivo (com sufixo, se houver) e os dígitos correspondentes.
const getEffectiveCnj = (content: string | null | undefined): { masked: string; digits: string } | null => {
  const cnjs = extractCnjs(content);
  const primary = cnjs[0];
  if (!primary) return null;
  const esc = primary.replace(/[.\-]/g, '\\$&');
  const m = (content || '').match(new RegExp(esc + '\\s*/\\s*(\\d{2})'));
  const suffix = m ? '/' + m[1] : '';
  const masked = primary + suffix;
  return { masked, digits: masked.replace(/\D/g, '') };
};
import { FilePlus2 } from 'lucide-react';
import { DjenHealthBadge } from '@/components/DjenHealthBadge';
import { DateInputBR } from '@/components/DateInputBR';
import { HistoricoConversas } from '@/components/HistoricoConversas';

interface Intim {
  id: string;
  court: string | null;
  content: string;
  deadline: string | null;
  status: string;
  received_at: string;
  created_at?: string;
  process_id: string | null;
  classificacao_status?: string | null;
  confianca_classificacao?: number | null;
  classification_meta?: {
    fase?: string | null;
    numero_execucao?: string | null;
    processo_principal?: string | null;
    linked_to_parent?: boolean;
  } | null;
}

interface DeadlineChoice {
  label: string;
  days: number;
  dueDate: string;
}

const UNSAFE_STATUSES = new Set(['ambigua_urgente', 'auto_baixa']);

const saoPauloDate = (value?: string | null) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
};

import { PRAXIS_TASK_TITLES } from '@/lib/praxisTitles';

export default function Intimacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const sistemaByCnj = useSistemaByCnj();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'todas' | 'pendente' | 'tratada'>('pendente');
  const [form, setForm] = useState({ court: '', content: '', deadline: '' });
  const [syncing, setSyncing] = useState(false);
  const [taskIntim, setTaskIntim] = useState<Intim | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', assignee: '', priority: 'alta',
    due_date: '', start_date: '', start_time: '', location: '', process_id: '', cc_user_id: '',
  });
  const [deadlineChoices, setDeadlineChoices] = useState<DeadlineChoice[]>([]);
  const [openingTaskId, setOpeningTaskId] = useState<string | null>(null);
  const [duplicateConfirmedProcessId, setDuplicateConfirmedProcessId] = useState<string | null>(null);
  const [manageTasks, setManageTasks] = useState<any[] | null>(null);
  const [manageBusyId, setManageBusyId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const t = todayISO();
    return isBusinessDay(t) ? t : previousBusinessDay(t);
  });

  const syncDjen = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-djen', { body: {}, method: 'POST' });
      if (error) throw error;
      // Upstream do CNJ instável: edge devolve 200 + upstream_unavailable
      if (data?.upstream_unavailable) {
        toast({
          title: 'CNJ/DJEN indisponível',
          description: data.error || 'O Diário Eletrônico está instável. Tente novamente em alguns minutos.',
          variant: 'destructive',
        });
        return;
      }
      const r = (data?.results || [])[0];
      if (!r) {
        const { data: oab } = await supabase
          .from('oab_settings')
          .select('id')
          .eq('active', true)
          .limit(1)
          .maybeSingle();
        if (!oab) toast({ title: 'Cadastre sua OAB em Configurações → Intimações', variant: 'destructive' });
        else toast({ title: 'Sincronizado', description: 'Nenhuma nova publicação encontrada' });
      } else toast({ title: 'Sincronizado', description: `${r.inserted} novas / ${r.total} encontradas` });
      qc.invalidateQueries({ queryKey: ['intimations'] });
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSyncing(false); }
  };

  // Reconciliação forçada: reprocessa os últimos 30 dias na DJEN ignorando o
  // filtro fuzzy de nome do advogado. Recupera publicações perdidas por
  // mismatch de destinatário (ex.: nome ausente/abreviado no payload DJEN).
  const [reconciling, setReconciling] = useState(false);
  const reconcileDjen = async () => {
    if (!confirm('Reconciliar 30 dias com a DJEN ignorando filtro de nome? Pode reinserir publicações antes descartadas.')) return;
    setReconciling(true);
    try {
      const today = todayISO();
      const startDate = new Date(`${today}T12:00:00Z`);
      startDate.setUTCDate(startDate.getUTCDate() - 30);
      const start = startDate.toISOString().slice(0, 10);
      const { data, error } = await supabase.functions.invoke('sync-djen', {
        body: { bypass_name_filter: true, date_start: start, date_end: today },
        method: 'POST',
      });
      if (error) throw error;
      if (data?.upstream_unavailable) {
        toast({ title: 'CNJ/DJEN indisponível', description: data.error, variant: 'destructive' });
        return;
      }
      const totalIns = (data?.results || []).reduce((s: number, r: any) => s + (r?.inserted || 0), 0);
      const totalFound = (data?.results || []).reduce((s: number, r: any) => s + (r?.total || 0), 0);
      toast({ title: 'Reconciliação concluída', description: `${totalIns} recuperadas / ${totalFound} verificadas` });
      qc.invalidateQueries({ queryKey: ['intimations'] });
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setReconciling(false); }
  };

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['intimations'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('intimations').select('*').order('received_at', { ascending: false }).limit(2000);
      if (error) throw error;
      return data as Intim[];
    },
    refetchInterval: 60_000, // Sprint1.7: poll de segurança 60s
  });

  // SprintClosure Item 1 (híbrido): reconciliação em background do prazo armazenado
  // contra a RPC canônica calculate_deadline (fonte única SQL). UI continua usando
  // o cálculo síncrono local — sem flicker, sem loading state extra.
  useDeadlineReconciliation(items);

  // Membros da equipe (papéis atribuídos) para preencher o seletor de responsável
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_team_members');
      if (error) throw error;
      return (data || []) as { user_id: string; email: string; full_name: string; roles: string[] }[];
    },
  });

  // Tarefas pendentes para espelho de carga no modal de criação de prazo
  const { data: tasks = [] } = useTasks();

  // ===== Espelho da agenda: carga de prazos pendentes por colaborador/dia =====
  const loadMap = useMemo(() => {
    const m = new Map<string, number>();
    (tasks as any[]).forEach((t) => {
      if (t.completed || t.status === 'cancelada' || !t.due_date) return;
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

  // Espelho da agenda reutilizado na página e no modal de criação de prazo
  const loadTableEl = loadRows.length > 0 ? (
    <div className="rounded-lg border border-stone-200 dark:border-border bg-white dark:bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-200 dark:border-border">
        <Calendar className="h-4 w-4 text-primary" />
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-stone-600 dark:text-muted-foreground">
          Carga de prazos por colaborador (próximos dias úteis)
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-stone-50 dark:bg-muted/40">
              <th className="text-left font-semibold px-3 py-1.5 text-stone-600 dark:text-muted-foreground">Responsável</th>
              {loadDays.map((iso) => (
                <th key={iso} className="px-1.5 py-1.5 text-center font-semibold text-stone-600 dark:text-muted-foreground whitespace-nowrap">
                  {formatBR(iso).slice(0, 5)}
                </th>
              ))}
              <th className="px-2 py-1.5 text-center font-semibold text-stone-600 dark:text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {loadRows.map((row) => (
              <tr key={row.email} className="border-t border-stone-100 dark:border-border/60">
                <td className="px-3 py-1.5 max-w-[180px] truncate text-stone-800 dark:text-foreground" title={row.email}>{row.name}</td>
                {row.cells.map((n, i) => (
                  <td key={loadDays[i]} className="px-0.5 py-0.5 text-center">
                    <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 tabular-nums ${loadCellClass(n)}`}>
                      {n || '·'}
                    </span>
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center font-bold tabular-nums text-stone-900 dark:text-foreground">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-1.5 text-[11px] text-stone-500 dark:text-muted-foreground border-t border-stone-100 dark:border-border/60">
        Verde: até 2 prazos · Âmbar: 3-4 · Vermelho: 5 ou mais no mesmo dia.
      </p>
    </div>
  ) : null;



  // Gestores/administradores disponíveis para cópia obrigatória do prazo.
  const supervisors = teamMembers.filter((m) =>
    (m.roles || []).some((r) => r === 'admin' || r === 'gerente')
  );

  // Oculta publicações sem dados processuais, mas aceita CNJ com ou sem máscara.
  // O DJEN às vezes grava "50069408220238130637" em vez de "5006940-82.2023.8.13.0637".
  const isDisplayableIntimation = (i: Intim) => !!i.process_id || hasCnj(i.content);
  const dayItems = useMemo(
    () => items.filter((i) => {
      if (i.received_at?.slice(0, 10) !== selectedDate) return false;
      return isDisplayableIntimation(i);
    }),
    [items, selectedDate]
  );

  const processNumbersForLookup = useMemo(() => {
    const variants = new Set<string>();
    dayItems.forEach((it) => {
      extractCnjs(it.content).forEach((cnj) => {
        variants.add(cnj);
        variants.add(cnj.replace(/\D/g, ''));
      });
      const eff = getEffectiveCnj(it.content);
      if (eff) { variants.add(eff.masked); variants.add(eff.digits); }
    });
    return Array.from(variants);
  }, [dayItems]);

  // Números de processo já cadastrados para as publicações carregadas.
  // Não usa listagem geral: evita limite de paginação e falso botão "Cadastrar processo".
  const { data: existingProcessNumbers = [], isLoading: loadingExistingProcesses } = useQuery({
    queryKey: ['process-numbers-for-intimations', user?.id, processNumbersForLookup.join('|')],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      if (processNumbersForLookup.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('processes')
        .select('number')
        .in('number', processNumbersForLookup);
      if (error) throw error;
      return (data || []).map((r: any) => (r.number || '').replace(/\D/g, '')) as string[];
    },
  });
  const existingProcessSet = useMemo(() => new Set(existingProcessNumbers), [existingProcessNumbers]);

  // Watchdog OAB: alerta vermelho persistente se inativa ou sem sync >24h
  const { data: oabWatch = [] } = useQuery({
    queryKey: ['oab-watchdog', user?.id],
    enabled: !!user,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('oab_settings')
        .select('oab_number, oab_uf, active, last_sync_at')
        .eq('user_id', user!.id);
      return data ?? [];
    },
  });
  const oabAlerts = oabWatch
    .map((o: any) => {
      const ageH = o.last_sync_at ? Math.round((Date.now() - new Date(o.last_sync_at).getTime()) / 3600_000) : Infinity;
      if (!o.active) return { label: `${o.oab_uf} ${o.oab_number}`, reason: 'INATIVA' };
      if (ageH > 24) return { label: `${o.oab_uf} ${o.oab_number}`, reason: `sem sync há ${ageH}h` };
      return null;
    })
    .filter(Boolean) as { label: string; reason: string }[];

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('intimations').insert({
        user_id: user!.id, court: form.court || null, content: form.content,
        deadline: form.deadline || null, received_at: selectedDate,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['intimations'] }); setOpen(false); setForm({ court: '', content: '', deadline: '' }); toast({ title: 'Intimação registrada' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const del = useMutation({
    mutationFn: async ({ it, reason }: { it: any; reason: string }) => {
      const sb: any = supabase;
      // 1) Snapshot + motivo em audit_logs (imutável).
      await sb.from('audit_logs').insert({
        user_id: user!.id,
        user_email: user!.email,
        action: 'DELETE',
        table_name: 'intimations',
        record_id: it.id,
        old_data: { ...it, __deletion_reason: reason },
      });
      // 2) Notifica todos admin/gerente ("supervisores").
      const { data: sups } = await sb.rpc('list_supervisors');
      const supIds: string[] = (sups || []).map((r: any) => r.user_id).filter(Boolean);
      const uniq = Array.from(new Set([...supIds, user!.id]));
      if (uniq.length) {
        await sb.from('notifications').insert(
          uniq.map((uid) => ({
            user_id: uid,
            title: '🗑️ Intimação excluída',
            message: `${user!.email} excluiu intimação${it.court ? ` (${it.court})` : ''}. Motivo: ${reason}`,
            type: 'warning',
            link: '/auditoria',
          }))
        );
      }
      // 3) Exclusão efetiva.
      const { error } = await sb.from('intimations').delete().eq('id', it.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimations'] });
      setDeleteTarget(null);
      setDeleteReason('');
      toast({ title: 'Excluída', description: 'Registro auditado e supervisores notificados.' });
    },
    onError: (e: any) => toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' }),
  });

  const [treatTarget, setTreatTarget] = useState<any>(null);
  const [treatReason, setTreatReason] = useState<string>('');
  const [treatNote, setTreatNote] = useState<string>('');

  const markDone = useMutation({
    mutationFn: async ({ it, reason, note }: { it: any; reason: string; note: string }) => {
      const sb: any = supabase;
      await sb.from('audit_logs').insert({
        user_id: user!.id,
        user_email: user!.email,
        action: 'MARK_TREATED',
        table_name: 'intimations',
        record_id: it.id,
        new_data: { status: 'tratada', reason, note, court: it.court ?? null },
      });
      const { error } = await sb.from('intimations').update({ status: 'tratada' }).eq('id', it.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimations'] });
      setTreatTarget(null); setTreatReason(''); setTreatNote('');
      toast({ title: 'Marcada como tratada', description: 'Motivo registrado em auditoria.' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  // Marca classificação como revisada pelo advogado + grava prazo manual.
  // Após isso, o reconciliation hook pula este registro (não sobrescreve mais).
  const markReviewed = useMutation({
    mutationFn: async ({ id, deadline }: { id: string; deadline: string }) => {
      const { error } = await (supabase as any).from('intimations').update({
        deadline,
        classificacao_status: 'revisada_advogado',
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimations'] });
      toast({ title: 'Prazo definido manualmente', description: 'Classificação marcada como revisada pelo advogado.' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  // Cadastro sob demanda de processo a partir de intimação órfã.
  // Regra: cliente NÃO é criado automaticamente (fica sem vínculo, com aviso).
  // Regra parent: só define parent_process_number quando fase='execucao' E há outro CNJ no texto.
  const registerProcess = useMutation({
    mutationFn: async (it: Intim) => {
      const cnjs = extractCnjs(it.content);
      if (cnjs.length === 0) throw new Error('Nenhum número CNJ encontrado na intimação.');
      const base = cnjs[0];
      const eff = getEffectiveCnj(it.content);
      // Se houver sufixo /NN (precatório, cumprimento, incidente), cadastra como processo distinto.
      const primary = eff?.masked || base;
      const primaryDigits = primary.replace(/\D/g, '');
      const baseDigits = base.replace(/\D/g, '');

      // Idempotência: se já existir com esse número para o usuário, apenas vincula.
      const { data: existing } = await (supabase as any)
        .from('processes').select('id').eq('user_id', user!.id).in('number', [primary, primaryDigits]).limit(1).maybeSingle();

      let processId = existing?.id as string | undefined;

      if (!processId) {
        const fase = it.classification_meta?.fase;
        const isExec = fase === 'execucao';
        const norm = (s: string | null | undefined) => (s || '').replace(/\D/g, '');
        // Com sufixo (/NN) o CNJ base é o processo principal por definição.
        const hasSuffix = primaryDigits !== baseDigits;
        const candidateParent = hasSuffix ? base : (it.classification_meta?.processo_principal || cnjs.find((c) => norm(c) !== primaryDigits) || null);
        // Guard: nunca vincular o processo a si mesmo como originário.
        const parent = (hasSuffix || isExec) && candidateParent && norm(candidateParent) !== primaryDigits ? candidateParent : null;

        const { data: created, error: pErr } = await (supabase as any)
          .from('processes')
          .insert({
            user_id: user!.id,
            number: primary,
            title: it.court ? `Processo ${primary} — ${it.court}` : `Processo ${primary}`,
            status: isExec ? 'execucao' : 'novo',
            tribunal: it.court || null,
            client_id: null,
            client_name: null,
            parent_process_number: parent,
            observations: 'Cadastrado automaticamente a partir de intimação. Vincule o cliente manualmente.',
          })
          .select('id').single();
        if (pErr) throw pErr;
        processId = created.id;
      }

      const { error: uErr } = await (supabase as any)
        .from('intimations').update({ process_id: processId }).eq('id', it.id);
      if (uErr) throw uErr;

      // Notificação de aviso: falta vincular cliente.
      await (supabase as any).from('notifications').insert({
        user_id: user!.id,
        title: 'Processo cadastrado sem cliente',
        message: `${primary} foi criado a partir de intimação. Vincule o cliente manualmente.`,
        type: 'warning',
        link: '/processos',
      });

      return { primary, reused: !!existing };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['intimations'] });
      qc.invalidateQueries({ queryKey: ['processes'] });
      qc.invalidateQueries({ queryKey: ['process-numbers-for-intimations'] });
      toast({
        title: r.reused ? 'Intimação vinculada' : 'Processo cadastrado',
        description: `${r.primary} — vincule o cliente em Processos.`,
      });
    },
    onError: (e: any) => toast({ title: 'Erro ao cadastrar processo', description: e.message, variant: 'destructive' }),
  });



  const toTask = useMutation({
    mutationFn: async (payload: { intim: Intim; form: typeof taskForm }) => {
      const { intim, form: tf } = payload;
      if (!tf.assignee.trim()) throw new Error('Responsável obrigatório.');
      if (!tf.cc_user_id) throw new Error('Cópia para gestor/administrador é obrigatória.');
      if (!tf.due_date) throw new Error('O prazo final (vencimento) é obrigatório.');
      const processId = tf.process_id || intim.process_id;
      const { data, error } = await supabase.from('tasks').insert({
        user_id: user!.id,
        title: tf.title || `Intimação: ${intim.court || 'sem tribunal'}`,
        description: tf.description || null,
        assignee: tf.assignee.trim(),
        due_date: tf.due_date || null,
        start_date: tf.start_date || null,
        start_time: tf.start_time || null,
        location: tf.location || null,
        priority: tf.priority,
        status: 'pendente',
        process_id: processId || null,
      }).select().single();
      if (error) throw error;
      await (supabase as any).rpc('notify_task_cc', {
        _cc_user_id: tf.cc_user_id,
        _title: data.title,
        _assignee: tf.assignee.trim(),
        _due_date: tf.due_date || null,
        _process_number: null,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setTaskIntim(null);
      toast({
        title: 'Responsável definido com sucesso',
        description: 'Acesse o módulo Prazos para acompanhar.',
      });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar prazo', description: e.message, variant: 'destructive' }),
  });

  const resolveProcessIdForIntimation = async (it: Intim) => {
    if (it.process_id) return it.process_id;
    const eff = getEffectiveCnj(it.content);
    if (!eff) return '';
    const { data, error } = await (supabase as any)
      .from('processes')
      .select('id')
      .in('number', [eff.masked, eff.digits])
      .limit(1);
    if (error) throw error;
    return data?.[0]?.id || '';
  };

  const confirmPendingTasksForProcess = async (processId: string) => {
    const { data, error } = await supabase.rpc('list_pending_tasks_for_process', { _process_id: processId });
    if (error) throw error;
    const dups = (data ?? []) as any[];
    if (dups.length === 0) return { ok: true, processId };
    const ok = await confirmModal(
      `Já existe(m) ${dups.length} prazo(s) pendente(s) neste processo:\n\n` +
      dups.slice(0, 5).map((t: any) => `• ${t.title}${t.due_date ? ` (prazo ${formatBR(t.due_date)})` : ''}`).join('\n') +
      `\n\nDeseja mesmo criar outra prazo neste processo?`,
      {
        title: 'Prazos pendentes neste processo',
        okLabel: 'Criar mesmo assim',
        extraLabel: 'Editar/excluir prazo existente',
        onExtra: () => setManageTasks(dups),
      }
    );
    if (ok) setDuplicateConfirmedProcessId(processId);
    return { ok, processId };
  };

  const confirmPendingTasksForProcessNumber = async (processNumber: string) => {
    const digits = processNumber.replace(/\D/g, '');
    const { data, error } = await supabase.rpc('list_pending_tasks_for_process_number', { _process_number: processNumber });
    if (error) throw error;
    const dups = (data ?? []) as any[];
    const processId = dups[0]?.process_id || '';
    if (dups.length === 0) return { ok: true, processId: '' };
    const ok = await confirmModal(
      `Já existe(m) ${dups.length} prazo(s) pendente(s) neste processo:\n\n` +
      dups.slice(0, 5).map((t: any) => `• ${t.title}${t.due_date ? ` (prazo ${formatBR(t.due_date)})` : ''}`).join('\n') +
      `\n\nDeseja mesmo criar outra prazo neste processo?`,
      {
        title: 'Prazos pendentes neste processo',
        okLabel: 'Criar mesmo assim',
        extraLabel: 'Editar/excluir prazo existente',
        onExtra: () => setManageTasks(dups),
      }
    );
    if (ok) setDuplicateConfirmedProcessId(processId || digits);
    return { ok, processId };
  };

  const handleOpenTaskDialog = async (it: Intim) => {
    setOpeningTaskId(it.id);
    setDuplicateConfirmedProcessId(null);
    try {
      let processId = await resolveProcessIdForIntimation(it);
      if (processId) {
        const result = await confirmPendingTasksForProcess(processId);
        if (!result.ok) return;
      } else {
        const eff = getEffectiveCnj(it.content);
        if (eff) {
          const result = await confirmPendingTasksForProcessNumber(eff.masked);
          if (!result.ok) return;
          processId = result.processId;
        }
      }
      openTaskDialog(it, processId);
    } catch (e: any) {
      toast({ title: 'Erro ao verificar prazos pendentes', description: e.message, variant: 'destructive' });
    } finally {
      setOpeningTaskId(null);
    }
  };

  const openTaskDialog = (it: Intim, processId = '') => {
    // Decode HTML entities (&iacute; → í) e tags para que o textarea mostre texto limpo.
    const decodeEntities = (s: string) => {
      const ta = document.createElement('textarea');
      ta.innerHTML = s;
      return ta.value;
    };
    const stripped = it.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    const plain = decodeEntities(stripped).replace(/\s+/g, ' ').trim();
    const tribunal = tribunalFromCNJ(extractCnjs(it.content)[0])?.sigla ?? null;
    const detectedDeadline = detectDeadline(it.content, it.received_at.slice(0, 10), todayISO(), { tribunal });
    const alternative = detectedDeadline?.pecaSugerida.peca_alternativa;
    const alternativeDueDate = detectedDeadline?.startDate && alternative
      ? alternative.prazo_dias === 1
        ? detectedDeadline.startDate
        : addBusinessDays(detectedDeadline.startDate, alternative.prazo_dias - 1)
      : null;
    const choices: DeadlineChoice[] = detectedDeadline?.dueDate
      ? [
          {
            label: detectedDeadline.pecaSugerida.peca,
            days: detectedDeadline.pecaSugerida.prazo_dias,
            dueDate: detectedDeadline.dueDate,
          },
          ...(alternative && alternativeDueDate
            ? [{ label: alternative.peca, days: alternative.prazo_dias, dueDate: alternativeDueDate }]
            : []),
        ]
      : [];
    setDeadlineChoices(choices);
    setTaskForm({
      title: '', // usuário escolhe / digita
      description: plain,
      assignee: '',
      priority: 'alta',
      // Havendo recursos alternativos, exige escolha expressa para não vincular
      // silenciosamente a data da apelação ao prazo de embargos.
      due_date: (choices.length > 1 ? '' : detectedDeadline?.dueDate || it.deadline || '').slice(0, 10),
      start_date: '',
      start_time: '',
      location: it.court || '',
      process_id: processId,
      cc_user_id: '',
    });
    setTaskIntim(it);
  };

  // Dedup frontend REMOVIDO em 2026-05-11.
  // Garantia agora é a UNIQUE parcial (user_id, external_id) WHERE external_id IS NOT NULL
  // + UNIQUE parcial (user_id, received_at, court, md5(content)) WHERE external_id IS NULL.
  // Bug de prefixo legado `djen:hash:` corrigido na migration de normalização de external_id.
  // Se duplicatas voltarem a aparecer aqui, é sinal de que a constraint está quebrada — NÃO mascarar.
  const countsByDate = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it) => {
      const d = it.received_at?.slice(0, 10);
      if (d) m.set(d, (m.get(d) ?? 0) + 1);
    });
    return m;
  }, [items]);

  const lateNoticeByDate = useMemo(() => {
    const today = todayISO();
    const m = new Map<string, number>();
    items.forEach((it) => {
      if (it.status === 'tratada') return;
      const received = it.received_at?.slice(0, 10);
      const captured = saoPauloDate(it.created_at);
      if (received && captured === today && received < today && isDisplayableIntimation(it)) {
        m.set(received, (m.get(received) ?? 0) + 1);
      }
    });
    return Array.from(m.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [items]);

  const filtered = dayItems.filter((i) => filter === 'todas' || i.status === filter);

  const goPrev = () => setSelectedDate((d) => previousBusinessDay(d));
  const goNext = () => {
    const next = nextBusinessDay(selectedDate);
    if (next > todayISO()) return;
    setSelectedDate(next);
  };
  const goToday = () => {
    const t = todayISO();
    setSelectedDate(isBusinessDay(t) ? t : previousBusinessDay(t));
  };

  const isHoliday = !isBusinessDay(selectedDate);
  // P0 #1: contador == itens renderizados (mesma fonte da lista)
  const totalDay = filtered.length;

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 shadow-sm">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-display font-semibold tracking-tight text-foreground">Intimações</h1>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">Calendário oficial CNJ · Sincronização DJEN automática a cada 6h</p>
            <div className="mt-2.5">
              <DjenHealthBadge />
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={syncDjen} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sincronizar
          </Button>
          <Button variant="outline" onClick={reconcileDjen} disabled={reconciling} title="Reprocessa 30 dias ignorando filtro de nome — recupera publicações perdidas">
            {reconciling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Reconciliar
          </Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova Intimação</Button>
        </div>
      </div>

      {/* Navegador de data (calendário CNJ) */}
      <div className="bg-card rounded-lg border shadow-card p-3 flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={goPrev} title="Dia útil anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <DateInputBR
            value={selectedDate}
            onChange={(v) => v && setSelectedDate(v)}
            className="h-9 w-44"
          />
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={goNext} title="Próximo dia útil" disabled={nextBusinessDay(selectedDate) > todayISO()}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={goToday}>Hoje</Button>
        <div className="flex items-center gap-2 ml-auto text-sm">
          <span className="font-medium">{formatBR(selectedDate)}</span>
          {isHoliday && <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">Não-útil (CNJ)</Badge>}
          <Badge variant="secondary" className="text-xs">{totalDay} publicação(ões)</Badge>
        </div>
      </div>

      <div className="flex gap-1">
        {(['pendente', 'todas', 'tratada'] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
            {f === 'pendente' ? 'Pendentes' : f === 'tratada' ? 'Tratadas' : 'Todas'}
          </Button>
        ))}
      </div>

      <div className="sticky top-0 z-30 bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:backdrop-blur-xl shadow-[0_1px_0_0_hsl(var(--border)/0.5)]">
        {loadTableEl}
      </div>

      {oabAlerts.length > 0 && (
        <div role="alert" className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 text-destructive shadow-card animate-pulse">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <div className="font-display font-bold">🚨 RISCO DE PERDA DE PRAZO — OAB sem sincronização</div>
              <ul className="text-sm mt-1 list-disc pl-5">
                {oabAlerts.map(a => <li key={a.label}><strong>OAB {a.label}</strong>: {a.reason}</li>)}
              </ul>
              <p className="text-xs mt-2">Vá em <strong>Configurações → Intimações</strong> e reative/verifique a OAB imediatamente.</p>
            </div>
          </div>
        </div>
      )}

      {lateNoticeByDate.length > 0 && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-warning shadow-card">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 animate-pulse" />
            <div className="space-y-2">
              <div className="font-display font-semibold">Possível publicação/intimação retardatária</div>
              <p className="text-sm text-foreground/90">
                Foram capturadas hoje publicações com data de disponibilização anterior. Confira as datas abaixo para evitar perda de prazo.
              </p>
              <div className="flex flex-wrap gap-2">
                {lateNoticeByDate.map(([date, count]) => (
                  <Button
                    key={date}
                    type="button"
                    size="sm"
                    variant={selectedDate === date ? 'default' : 'outline'}
                    onClick={() => { setSelectedDate(date); setFilter('pendente'); }}
                    className="h-8"
                  >
                    {formatBR(date)} · {count}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>Nenhuma publicação disponibilizada em {formatBR(selectedDate)}.</p>
          <p className="text-xs mt-1">Use "Sincronizar" para buscar novas intimações deste dia.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((it) => {
            const primaryCnj = extractCnjs(it.content)[0];
            const base = tribunalFromCNJ(primaryCnj, it.content);
            const sisAgg = sistemaByCnj(primaryCnj, it.court, it.received_at);
            const tribInfo = base && sisAgg && sisAgg !== base.sistema
              ? { ...base, sistema: sisAgg, sistemasAlternativos: [base.sistema, ...(base.sistemasAlternativos || [])].filter((x): x is string => !!x && x !== sisAgg) }
              : base;
            const tribunal = tribInfo?.sigla ?? null;
            const detectedDeadline = detectDeadline(it.content, it.received_at.slice(0, 10), todayISO(), { tribunal });
            const isUnsafe = !!it.classificacao_status && UNSAFE_STATUSES.has(it.classificacao_status);

            return (
              <div key={it.id} className="bg-card rounded-lg p-4 border shadow-card hover:shadow-card-hover flex gap-3">
                <div className="flex-1 min-w-0">
                  {(() => {
                    const cnjs = extractCnjs(it.content);
                    const primary = cnjs[0];
                    if (!primary) return null;
                    return (
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          title="Número do processo"
                          className="inline-flex items-center gap-2 w-fit text-sm sm:text-base font-mono font-semibold text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-1.5"
                        >
                          <FileText className="h-4 w-4 text-primary/70" />
                          {primary}
                        </span>
                        <CopyNumber number={primary} className="p-1.5 rounded-md hover:bg-primary/10" />
                      </div>
                    );
                  })()}
                  <div className="flex items-center gap-2 flex-wrap">
                    {it.court && <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{it.court}</span>}
                    {tribInfo?.sistema && (
                      <Badge
                        variant="outline"
                        className="text-xs border-sky-400 text-sky-800 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-200"
                        title={tribInfo.sistemasAlternativos?.length
                          ? `${tribInfo.sigla} — também em uso: ${tribInfo.sistemasAlternativos.join(', ')}`
                          : `${tribInfo.sigla} — sistema de tramitação eletrônica`}
                      >
                        {tribInfo.sistema}
                      </Badge>
                    )}
                    <Badge variant={it.status === 'tratada' ? 'outline' : 'default'} className="text-xs">{it.status}</Badge>
                    {it.classification_meta?.fase === 'execucao' && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 font-semibold gap-1"
                        title={it.classification_meta?.processo_principal
                          ? `Cumprimento de sentença vinculado ao processo principal ${it.classification_meta.processo_principal}`
                          : 'Publicação em fase de execução / cumprimento de sentença'}
                      >
                        ⚖ Execução
                        {it.classification_meta?.numero_execucao && (
                          <span className="font-mono opacity-80">· {it.classification_meta.numero_execucao}</span>
                        )}
                      </Badge>
                    )}
                    {!isUnsafe && detectedDeadline && !detectedDeadline.isFallback && (
                      <DeadlineBadge deadline={detectedDeadline} receivedAtISO={it.received_at.slice(0, 10)} />
                    )}
                    {!isUnsafe && it.deadline && !detectedDeadline?.dueDate && <span className="text-xs text-warning">Prazo manual: {formatBR(it.deadline.slice(0, 10))}</span>}
                    {!isUnsafe && it.deadline && detectedDeadline?.dueDate && detectedDeadline.dueDate !== it.deadline.slice(0, 10) && (
                      <span className="text-xs text-destructive" title="Prazo gravado divergente do cálculo atual do motor. Vale o vencimento calculado.">
                        Prazo desatualizado: {formatBR(it.deadline.slice(0, 10))} (obsoleto)
                      </span>
                    )}
                  </div>

                  {!isUnsafe && detectedDeadline && !detectedDeadline.isFallback && detectedDeadline.dueDate && (detectedDeadline.severity === 'critical' || detectedDeadline.severity === 'expired' || (detectedDeadline.severity === 'warning' && detectedDeadline.businessDaysLeft <= 2)) && (
                    <div
                      role="alert"
                      className={`mt-3 flex items-start gap-3 rounded-lg border-l-4 px-3 py-2.5 shadow-sm ${
                        detectedDeadline.severity === 'expired'
                          ? 'border-l-destructive bg-destructive/10 text-destructive'
                          : detectedDeadline.severity === 'critical'
                            ? 'border-l-destructive bg-destructive/5 text-destructive'
                            : 'border-l-warning bg-warning/10 text-warning'
                      }`}
                    >
                      <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${detectedDeadline.severity !== 'warning' ? 'animate-pulse' : ''}`} />
                      <div className="text-xs leading-relaxed">
                        <div className="font-bold uppercase tracking-wide">
                          {detectedDeadline.severity === 'expired'
                            ? `Prazo vencido há ${Math.abs(detectedDeadline.businessDaysLeft)} dia(s) útil(eis)`
                            : detectedDeadline.businessDaysLeft === 0
                              ? 'Prazo vence hoje'
                              : detectedDeadline.businessDaysLeft === 1
                                ? 'Prazo vence amanhã'
                                : `Faltam ${detectedDeadline.businessDaysLeft} dias úteis para o vencimento`}
                        </div>
                        <div className="opacity-90">
                          {detectedDeadline.label} · vencimento em {formatBR(detectedDeadline.dueDate)} · peça sugerida: {detectedDeadline.pecaSugerida.peca}
                        </div>
                      </div>
                    </div>
                  )}

                  {isUnsafe && (
                    <div className="mt-3 rounded-md border-2 border-destructive bg-destructive/10 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-destructive font-bold uppercase text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        PRAZO NÃO IDENTIFICADO — REVISE URGENTE
                      </div>
                      <p className="text-xs text-destructive/90">
                        Classificação automática com confiança {((it.confianca_classificacao ?? 0) * 100).toFixed(0)}%
                        {' '}({it.classificacao_status?.replace('_', ' ')}). Por segurança jurídica, NENHUM prazo presumido é exibido.
                        O advogado responsável deve confirmar manualmente o prazo cabível conforme o teor da decisão.
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <DateInputBR
                          className="h-8 w-40 text-xs"
                          onChange={(v) => {
                            if (v) markReviewed.mutate({ id: it.id, deadline: v });
                          }}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          Selecione a data e o prazo será gravado como revisado.
                        </span>
                      </div>
                    </div>
                  )}

                  {!isUnsafe && detectedDeadline?.startDate && detectedDeadline?.dueDate && (
                    <DeadlinePanel
                      deadline={detectedDeadline}
                      receivedAtISO={it.received_at.slice(0, 10)}
                      tribunal={tribunal}
                    />
                  )}
                  {(() => {
                    const r = renderSafeContent(it.content);
                    return r.html
                      ? <div className="text-sm mt-2 break-words intim-content prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: r.html }} />
                      : <p className="text-sm mt-2 whitespace-pre-wrap break-words">{r.text}</p>;
                  })()}
                  <p className="text-xs text-muted-foreground mt-1">Disponibilizada em {formatBR(it.received_at.slice(0, 10))}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {(() => {
                    // Só considera o CNJ primário da intimação (primeiro do texto).
                    // Antes usava .some() sobre todos os CNJs, o que ocultava o botão
                    // em cumprimentos de sentença quando o processo principal (citado
                    // no corpo) já estava cadastrado, mesmo com o cumprimento inédito.
                    // Considera sufixo /NN (precatório, cumprimento, incidente) como
                    // processo distinto do CNJ base.
                    const eff = getEffectiveCnj(it.content);
                    const alreadyExists = !!eff && existingProcessSet.has(eff.digits);
                    return !loadingExistingProcesses && hasCnj(it.content) && !alreadyExists;
                  })() && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => registerProcess.mutate(it)}
                      disabled={registerProcess.isPending}
                      title="Cadastrar processo automaticamente a partir desta intimação"
                    >
                      <FilePlus2 className="h-3 w-3 mr-1" />
                      {registerProcess.isPending ? 'Cadastrando…' : 'Cadastrar processo'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleOpenTaskDialog(it)} disabled={openingTaskId === it.id}>
                    {openingTaskId === it.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckSquare className="h-3 w-3 mr-1" />}
                    Criar Prazo
                  </Button>
                  {it.status !== 'tratada' && (
                    <Button size="sm" variant="ghost" onClick={() => { setTreatTarget(it); setTreatReason(''); setTreatNote(''); }}>Marcar tratada</Button>
                  )}
                  <DeleteGuard>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(it)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </DeleteGuard>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Intimação ({formatBR(selectedDate)})</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Tribunal/Vara</Label><Input value={form.court} onChange={(e) => setForm({ ...form, court: e.target.value })} placeholder="Ex: 2ª Vara Cível - TJSP" /></div>
            <div><Label>Conteúdo *</Label><Textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
            <div><Label>Prazo</Label><DateInputBR value={form.deadline} onChange={(v) => setForm({ ...form, deadline: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.content || create.isPending}>
              {create.isPending ? 'Salvando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar/excluir prazos já existentes no processo */}
      <Dialog open={!!manageTasks} onOpenChange={(o) => { if (!o) setManageTasks(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar ou excluir prazo existente</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {(manageTasks ?? []).map((t: any) => (
              <div key={t.id} className="rounded-lg border p-3 space-y-2">
                <div>
                  <Label>Título</Label>
                  <Input
                    value={t.title ?? ''}
                    onChange={(e) => setManageTasks((prev) => (prev ?? []).map((x) => x.id === t.id ? { ...x, title: e.target.value } : x))}
                  />
                </div>
                <div>
                  <Label>Prazo final</Label>
                  <DateInputBR
                    value={t.due_date ?? ''}
                    onChange={(v) => setManageTasks((prev) => (prev ?? []).map((x) => x.id === t.id ? { ...x, due_date: v } : x))}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <DeleteGuard>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={manageBusyId === t.id}
                      onClick={async () => {
                        const ok = await confirmModal(`Excluir definitivamente o prazo "${t.title}"?`, { title: 'Excluir prazo', okLabel: 'Excluir' });
                        if (!ok) return;
                        setManageBusyId(t.id);
                        const { error } = await (supabase as any).from('tasks').delete().eq('id', t.id);
                        setManageBusyId(null);
                        if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
                        qc.invalidateQueries({ queryKey: ['tasks'] });
                        setManageTasks((prev) => {
                          const next = (prev ?? []).filter((x) => x.id !== t.id);
                          return next.length ? next : null;
                        });
                        toast({ title: 'Prazo excluído' });
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Excluir
                    </Button>
                  </DeleteGuard>
                  <Button
                    size="sm"
                    disabled={manageBusyId === t.id || !t.title}
                    onClick={async () => {
                      setManageBusyId(t.id);
                      const { error } = await (supabase as any)
                        .from('tasks')
                        .update({ title: t.title, due_date: t.due_date || null })
                        .eq('id', t.id);
                      setManageBusyId(null);
                      if (error) { toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }); return; }
                      qc.invalidateQueries({ queryKey: ['tasks'] });
                      toast({ title: 'Prazo atualizado' });
                    }}
                  >
                    {manageBusyId === t.id ? 'Salvando…' : 'Salvar'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageTasks(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Confirmação de exclusão com motivo obrigatório */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Excluir intimação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div role="alert" className="rounded-md border-l-4 border-destructive bg-destructive/10 p-3 text-[12px] leading-relaxed">
              <p className="font-semibold mb-1">Esta ação é IRREVERSÍVEL.</p>
              <p>A exclusão ficará <strong>registrada em auditoria</strong> (usuário, data/hora, conteúdo integral e motivo) e <strong>uma cópia será enviada imediatamente aos supervisores/administradores</strong> do sistema.</p>
            </div>
            {deleteTarget?.court && (
              <div className="text-sm text-muted-foreground">
                <strong>Intimação:</strong> {deleteTarget.court}
              </div>
            )}
            <div>
              <Label>Motivo da exclusão *</Label>
              <Textarea
                rows={4}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Descreva de forma clara por que esta intimação deve ser excluída (mín. 10 caracteres)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteReason(''); }}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteReason.trim().length < 10 || del.isPending}
              onClick={() => del.mutate({ it: deleteTarget, reason: deleteReason.trim() })}
            >
              {del.isPending ? 'Excluindo…' : 'Confirmar exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Marcar como tratada — exige motivo */}
      <Dialog open={!!treatTarget} onOpenChange={(o) => { if (!o) { setTreatTarget(null); setTreatReason(''); setTreatNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" /> Marcar intimação como tratada
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div role="alert" className="rounded-md border-l-4 border-warning bg-warning/10 p-3 text-[12px] leading-relaxed">
              <p className="font-semibold mb-1">Confirme antes de prosseguir.</p>
              <p>Ao marcar como tratada, a intimação sai da lista de pendentes. O motivo escolhido fica <strong>registrado em auditoria</strong> (usuário, data/hora e justificativa).</p>
            </div>
            {treatTarget?.court && (
              <div className="text-sm text-muted-foreground"><strong>Intimação:</strong> {treatTarget.court}</div>
            )}
            <div>
              <Label>Motivo *</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={treatReason}
                onChange={(e) => setTreatReason(e.target.value)}
              >
                <option value="">Selecione um motivo…</option>
                <option value="Prazo já cadastrado no processo">Prazo já cadastrado no processo</option>
                <option value="Prazo da parte contrária (sem providência nossa)">Prazo da parte contrária (sem providência nossa)</option>
                <option value="Apenas ciência / sem prazo processual">Apenas ciência / sem prazo processual</option>
                <option value="Peça já protocolada">Peça já protocolada</option>
                <option value="Intimação duplicada">Intimação duplicada</option>
                <option value="Não pertence ao escritório">Não pertence ao escritório</option>
                <option value="Outro">Outro (descrever abaixo)</option>
              </select>
            </div>
            <div>
              <Label>Observações {treatReason === 'Outro' && <span className="text-destructive">*</span>}</Label>
              <Textarea
                rows={3}
                value={treatNote}
                onChange={(e) => setTreatNote(e.target.value)}
                placeholder="Justifique brevemente (opcional, exceto para 'Outro')"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTreatTarget(null); setTreatReason(''); setTreatNote(''); }}>Cancelar</Button>
            <Button
              disabled={!treatReason || (treatReason === 'Outro' && treatNote.trim().length < 5) || markDone.isPending}
              onClick={() => markDone.mutate({ it: treatTarget, reason: treatReason, note: treatNote.trim() })}
            >
              {markDone.isPending ? 'Salvando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de delegação de prazo */}
      <Dialog open={!!taskIntim} onOpenChange={(o) => { if (!o) setTaskIntim(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" /> Responsável pelo Prazo da Intimação
            </DialogTitle>
          </DialogHeader>

          {/* Espelho da agenda: carga de prazos pendentes por colaborador/dia (sempre visível) */}
          {loadTableEl && <div className="shrink-0 px-6 pb-3">{loadTableEl}</div>}


          <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-3 min-h-0">
            <div role="alert" className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
              <p className="font-semibold mb-1">⚠ Atenção ao prazo fatal</p>
              <p>Registre o prazo, preferencialmente, com <strong>no mínimo 2 dias úteis de antecedência</strong> ao prazo fatal. Faça dupla verificação da data, feriados e suspensões. <strong>Perda de prazo = perda do processo</strong>.</p>
            </div>
            {deadlineChoices.length > 1 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">
                    Selecione a medida e o prazo *
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {deadlineChoices.map((choice) => {
                    const selected = taskForm.title === choice.label && taskForm.due_date === choice.dueDate;
                    return (
                      <button
                        key={`${choice.label}-${choice.dueDate}`}
                        type="button"
                        onClick={() => setTaskForm((current) => ({
                          ...current,
                          title: choice.label,
                          due_date: choice.dueDate,
                        }))}
                        className={`group flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-all ${
                          selected
                            ? 'border-primary bg-primary text-primary-foreground shadow-gold'
                            : 'border-border bg-card hover:border-primary/40 hover:bg-accent/40'
                        }`}
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-primary-foreground bg-primary-foreground text-primary' : 'border-muted-foreground/40'}`}>
                          {selected && <CheckSquare className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold leading-tight">{choice.label}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] opacity-80">
                            <span className={`rounded px-1 py-0.5 font-semibold ${selected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                              {choice.days} d.u.
                            </span>
                            <span className="flex items-center gap-1 tabular-nums">
                              <CalendarDays className="h-3 w-3" />
                              vence {formatBR(choice.dueDate)}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <Label>Título do prazo *</Label>
              <Input
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="Digite ou selecione abaixo"
                className="mt-1"
                list="praxis-titles"
              />
              <datalist id="praxis-titles">
                {PRAXIS_TASK_TITLES.map((t) => <option key={t} value={t} />)}
              </datalist>
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {PRAXIS_TASK_TITLES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTaskForm((f) => ({ ...f, title: t }))}
                    className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                      taskForm.title === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/40 hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Selecione um título da praxis ou digite um personalizado. O prazo aparecerá na Agenda no dia escolhido.
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Descrição / Detalhes</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onMouseDown={(e) => {
                    e.preventDefault(); // preserva seleção
                    const el = document.getElementById('task-desc');
                    if (!el) return;
                    const sel = window.getSelection();
                    if (!sel || sel.isCollapsed) return;
                    if (!el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return;
                    const range = sel.getRangeAt(0);
                    const mark = document.createElement('mark');
                    mark.style.backgroundColor = '#fde047';
                    mark.style.color = 'inherit';
                    try {
                      range.surroundContents(mark);
                    } catch {
                      mark.appendChild(range.extractContents());
                      range.insertNode(mark);
                    }
                    sel.removeAllRanges();
                    setTaskForm(f => ({ ...f, description: el.innerHTML }));
                  }}
                >
                  <Highlighter className="h-3 w-3" /> Grifar
                </Button>
              </div>
              <div
                id="task-desc"
                contentEditable
                suppressContentEditableWarning
                className="mt-1 min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                dangerouslySetInnerHTML={{ __html: taskForm.description }}
                onBlur={(e) => setTaskForm(f => ({ ...f, description: (e.currentTarget as HTMLDivElement).innerHTML }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Responsável *</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm h-10"
                  value={
                    teamMembers.some((m) => m.email === taskForm.assignee)
                      ? taskForm.assignee
                      : taskForm.assignee
                        ? '__custom__'
                        : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__custom__') setTaskForm({ ...taskForm, assignee: ' ' });
                    else setTaskForm({ ...taskForm, assignee: v });
                  }}
                >
                  <option value="">— Selecionar —</option>
                  {teamMembers.map((m) => (
                    <option key={m.user_id} value={m.email}>
                      {m.email}
                    </option>
                  ))}
                  <option value="__custom__">Outro (digitar nome)</option>
                </select>
                {taskForm.assignee &&
                  !teamMembers.some((m) => m.email === taskForm.assignee) && (
                    <Input
                      value={taskForm.assignee.trim()}
                      onChange={(e) => setTaskForm({ ...taskForm, assignee: e.target.value })}
                      placeholder="Nome do advogado/responsável"
                      className="mt-2"
                    />
                  )}
              </div>
              <div>
                <Label>Prioridade</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                >
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1">Data inicial</Label>
                <DateInputBR
                  value={taskForm.start_date}
                  onChange={(v) => setTaskForm({ ...taskForm, start_date: v })}
                  className="mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Aparece na agenda a partir desta data e permanece até ser concluída.
                </p>
              </div>
              <div>
                <Label className="flex items-center gap-1">Prazo final *</Label>
                <DateInputBR
                  value={taskForm.due_date}
                  onChange={(v) => setTaskForm({ ...taskForm, due_date: v })}
                  className="mt-1"
                />
                {taskForm.due_date && (() => {
                  const iso = taskForm.due_date.slice(0, 10);
                  if (taskForm.assignee) {
                    const n = loadMap.get(`${taskForm.assignee}|${iso}`) ?? 0;
                    return (
                      <p className={`text-[11px] mt-1 ${n >= 2 ? 'text-info font-semibold' : n === 1 ? 'text-amber-600 dark:text-warning font-medium' : 'text-muted-foreground'}`}>
                        {n === 0
                          ? 'Nenhum prazo pendente do responsável nesta data.'
                          : `${n} prazo(s) pendente(s) do responsável nesta data${n >= 2 ? ' — considere outra data para evitar acúmulo.' : '.'}`}
                      </p>
                    );
                  }
                  const perAssignee: { name: string; n: number }[] = [];
                  loadMap.forEach((n, k) => {
                    const [email, d] = k.split('|');
                    if (d !== iso || n <= 0) return;
                    const member = teamMembers.find((m) => m.email === email);
                    perAssignee.push({ name: member?.full_name || email, n });
                  });
                  perAssignee.sort((a, b) => b.n - a.n);
                  const total = perAssignee.reduce((a, b) => a + b.n, 0);
                  if (total === 0) {
                    return <p className="mt-1 text-[11px] text-muted-foreground">Nenhum prazo pendente nesta data.</p>;
                  }
                  return (
                    <p className="mt-1 text-[11px]">
                      <span className="text-destructive font-bold">{total} prazo(s) já nesta data:</span>{' '}
                      {perAssignee.map((person, index) => (
                        <span key={person.name}>
                          {index > 0 && <span className="text-muted-foreground"> · </span>}
                          <span className="text-foreground font-medium">
                            {person.name} ({person.n})
                          </span>
                        </span>
                      ))}
                    </p>
                  );
                })()}

              </div>
              <div>
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={taskForm.start_time}
                  onChange={(e) => setTaskForm({ ...taskForm, start_time: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Local / Tribunal</Label>
              <Input
                value={taskForm.location}
                onChange={(e) => setTaskForm({ ...taskForm, location: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Com cópia para (gestor/administrador) *</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm h-10"
                value={taskForm.cc_user_id}
                onChange={(e) => setTaskForm({ ...taskForm, cc_user_id: e.target.value })}
                required
              >
                <option value="">— Selecionar —</option>
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
            {(taskForm.process_id || taskIntim?.process_id) && (
              <div className="border-t pt-3">
                <Label className="flex items-center gap-1 mb-2">Histórico de conversas</Label>
                <div className="h-[320px]">
                  <HistoricoConversas processId={(taskForm.process_id || taskIntim?.process_id) as string} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button variant="outline" onClick={() => setTaskIntim(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!taskIntim) return;
                const processId = taskForm.process_id || taskIntim.process_id || '';
                if (processId && duplicateConfirmedProcessId !== processId) {
                  const result = await confirmPendingTasksForProcess(processId);
                  if (!result.ok) return;
                }
                if (!(await confirmModal('O prazo assinalado foi conferido? Deseja realmente continuar?', { title: 'Conferência de prazo' }))) return;
                toTask.mutate({ intim: taskIntim, form: taskForm });
              }}
              disabled={!taskForm.title.trim() || !taskForm.assignee.trim() || !taskForm.cc_user_id || !taskForm.due_date || toTask.isPending}
            >
              {toTask.isPending ? 'Criando…' : 'Criar Prazo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
