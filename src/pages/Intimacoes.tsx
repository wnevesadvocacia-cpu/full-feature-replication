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
import { Plus, Loader2, Trash2, CheckSquare, Bell, RefreshCw, ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, Highlighter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isBusinessDay, previousBusinessDay, nextBusinessDay, formatBR, todayISO } from '@/lib/cnjCalendar';
import { detectDeadline } from '@/lib/legalDeadlines';
import { renderSafeContent } from '@/lib/sanitizeHtml';
import { useDeadlineReconciliation } from '@/hooks/useDeadlineReconciliation';
import { DeadlineBadge } from '@/components/DeadlineBadge';
import { DeleteGuard } from '@/components/DeleteGuard';
import { hasCnj, extractCnjs } from '@/lib/cnjRegex';

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

// Títulos comuns da praxis jurídica para tarefas delegadas a partir de intimações
const PRAXIS_TASK_TITLES = [
  'Acompanhar expedição de guia',
  'Acompanhar expedição de MLE/alvará',
  'Avisar cliente sobre perícia',
  'Avisar cliente sobre audiência',
  'Juntar petição',
  'Petições diversas',
  'Elaborar contestação',
  'Elaborar réplica',
  'Elaborar recurso (apelação)',
  'Elaborar embargos de declaração',
  'Elaborar agravo de instrumento',
  'Cumprir diligência',
  'Cumprir despacho',
  'Comparecer à audiência',
  'Comparecer à perícia',
  'Solicitar documentos ao cliente',
  'Solicitar cópia integral dos autos',
  'Protocolar manifestação',
  'Protocolar memoriais',
  'Pagar custas processuais',
  'Pagar guia GRU / DARF',
  'Levantar alvará',
  'Substabelecer poderes',
  'Apresentar contrarrazões',
  'Atualizar cálculos',
  'Realizar audiência de conciliação',
  'Verificar publicação no DJE',
];

export default function Intimacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'todas' | 'pendente' | 'tratada'>('pendente');
  const [form, setForm] = useState({ court: '', content: '', deadline: '' });
  const [syncing, setSyncing] = useState(false);
  const [taskIntim, setTaskIntim] = useState<Intim | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', assignee: '', priority: 'alta',
    due_date: '', start_time: '', location: '',
  });
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
      return (data || []) as { user_id: string; email: string; roles: string[] }[];
    },
  });

  // Oculta publicações sem dados processuais, mas aceita CNJ com ou sem máscara.
  // O DJEN às vezes grava "50069408220238130637" em vez de "5006940-82.2023.8.13.0637".
  const dayItems = useMemo(
    () => items.filter((i) => {
      if (i.received_at?.slice(0, 10) !== selectedDate) return false;
      if (i.process_id) return true;
      return hasCnj(i.content);
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

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from('intimations').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['intimations'] }); toast({ title: 'Excluída' }); },
  });

  const markDone = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from('intimations').update({ status: 'tratada' }).eq('id', id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intimations'] }),
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
      const primary = cnjs[0];
      const primaryDigits = primary.replace(/\D/g, '');

      // Idempotência: se já existir com esse número para o usuário, apenas vincula.
      const { data: existing } = await (supabase as any)
        .from('processes').select('id').eq('user_id', user!.id).in('number', [primary, primaryDigits]).limit(1).maybeSingle();

      let processId = existing?.id as string | undefined;

      if (!processId) {
        const fase = it.classification_meta?.fase;
        const isExec = fase === 'execucao';
        const norm = (s: string | null | undefined) => (s || '').replace(/\D/g, '');
        const candidateParent = it.classification_meta?.processo_principal || cnjs.find((c) => norm(c) !== primaryDigits) || null;
        // Guard: nunca vincular o processo a si mesmo como originário.
        const parent = isExec && candidateParent && norm(candidateParent) !== primaryDigits ? candidateParent : null;

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
      const { data, error } = await supabase.from('tasks').insert({
        user_id: user!.id,
        title: tf.title || `Intimação: ${intim.court || 'sem tribunal'}`,
        description: tf.description || null,
        assignee: tf.assignee.trim(),
        due_date: tf.due_date || null,
        start_time: tf.start_time || null,
        location: tf.location || null,
        priority: tf.priority,
        status: 'pendente',
        process_id: intim.process_id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setTaskIntim(null);
      toast({
        title: 'Responsável definido com sucesso',
        description: 'Acesse o módulo Tarefas para acompanhar.',
      });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar tarefa', description: e.message, variant: 'destructive' }),
  });

  const openTaskDialog = (it: Intim) => {
    // Decode HTML entities (&iacute; → í) e tags para que o textarea mostre texto limpo.
    const decodeEntities = (s: string) => {
      const ta = document.createElement('textarea');
      ta.innerHTML = s;
      return ta.value;
    };
    const stripped = it.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    const plain = decodeEntities(stripped).replace(/\s+/g, ' ').trim();
    const detectedDeadline = detectDeadline(it.content, it.received_at.slice(0, 10), todayISO());
    setTaskForm({
      title: '', // usuário escolhe / digita
      description: plain,
      assignee: '',
      priority: 'alta',
      due_date: (it.deadline || detectedDeadline?.dueDate || '').slice(0, 10),
      start_time: '',
      location: it.court || '',
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
      if (received && captured === today && received >= today) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Intimações</h1>
          <p className="text-muted-foreground text-sm mt-1">Calendário oficial CNJ · Sincronização DJEN automática a cada 6h</p>
          <DjenHealthBadge />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={syncDjen} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sincronizar
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
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="h-9 w-44"
            max={todayISO()}
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
                    onClick={() => setSelectedDate(date)}
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
            const detectedDeadline = detectDeadline(it.content, it.received_at.slice(0, 10), todayISO());
            const isUnsafe = !!it.classificacao_status && UNSAFE_STATUSES.has(it.classificacao_status);

            return (
              <div key={it.id} className="bg-card rounded-lg p-4 border shadow-card hover:shadow-card-hover flex gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {it.court && <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{it.court}</span>}
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
                    {!isUnsafe && it.deadline && (!detectedDeadline?.dueDate || detectedDeadline.dueDate !== it.deadline.slice(0, 10)) && <span className="text-xs text-warning">Prazo manual: {formatBR(it.deadline.slice(0, 10))}</span>}
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
                        <Input
                          type="date"
                          className="h-8 w-40 text-xs"
                          min={it.received_at.slice(0, 10)}
                          onChange={(e) => {
                            const v = e.target.value;
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
                    <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      <span className="font-medium">Prazo:</span>
                      <span>início {formatBR(detectedDeadline.startDate)}</span>
                      <span>•</span>
                      <span>vencimento {formatBR(detectedDeadline.dueDate)}</span>
                    </div>
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
                    const primaryCnj = (extractCnjs(it.content)[0] || '').replace(/\D/g, '');
                    const alreadyExists = !!primaryCnj && existingProcessSet.has(primaryCnj);
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
                  <Button size="sm" variant="outline" onClick={() => openTaskDialog(it)}>
                    <CheckSquare className="h-3 w-3 mr-1" /> Criar Tarefa
                  </Button>
                  {it.status !== 'tratada' && (
                    <Button size="sm" variant="ghost" onClick={() => markDone.mutate(it.id)}>Marcar tratada</Button>
                  )}
                  <DeleteGuard>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate(it.id)}>
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
            <div><Label>Prazo</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.content || create.isPending}>
              {create.isPending ? 'Salvando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de delegação de tarefa */}
      <Dialog open={!!taskIntim} onOpenChange={(o) => { if (!o) setTaskIntim(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" /> Responsável pela Tarefa da Intimação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div role="alert" className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
              <p className="font-semibold mb-1">⚠ Atenção ao prazo fatal</p>
              <p>Registre o prazo, preferencialmente, com <strong>no mínimo 2 dias úteis de antecedência</strong> ao prazo fatal. Faça dupla verificação da data, feriados e suspensões. <strong>Perda de prazo = perda do processo</strong>.</p>
            </div>
            <div>
              <Label>Título da tarefa *</Label>
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
                Selecione um título da praxis ou digite um personalizado. A tarefa aparecerá na Agenda no dia escolhido.
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
                <Label>Prazo</Label>
                <Input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                  className="mt-1"
                />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskIntim(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!taskIntim) return;
                if (!window.confirm('O prazo assinalado foi conferido? Deseja realmente continuar?')) return;
                toTask.mutate({ intim: taskIntim, form: taskForm });
              }}
              disabled={!taskForm.title.trim() || !taskForm.assignee.trim() || toTask.isPending}
            >
              {toTask.isPending ? 'Criando…' : 'Criar Tarefa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
