import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Users, CheckSquare, AlertCircle, TrendingUp, Clock, Plus, Paperclip, Loader2, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ProcessSearchSelect } from '@/components/ProcessSearchSelect';
import { attachDocumentToProcess } from '@/lib/attachDocument';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatBR, isBusinessDay, todayISO } from '@/lib/cnjCalendar';

interface ProcessStats {
  total: number;
  active: number;
  concluded: number;
  pending: number;
}

interface RecentProcess {
  id: string;
  number: string;
  title: string;
  status: string;
  updated_at: string;
}

interface RecentTask {
  id: string;
  title: string;
  due_date: string;
  completed: boolean;
  process_id: string;
  assignee?: string | null;
  status?: string | null;
}

interface TeamMember {
  user_id: string;
  email: string;
  full_name: string;
  roles: string[];
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
  concluido: 'bg-gray-100 text-gray-800',
  ativo: 'bg-green-100 text-green-800',
  arquivado: 'bg-gray-100 text-gray-800',
  recursal: 'bg-purple-100 text-purple-800',
  sobrestamento: 'bg-orange-100 text-orange-800',
  active: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  closed: 'bg-gray-100 text-gray-800',
};

export default function Dashboard() {
  const [stats, setStats] = useState<ProcessStats>({ total: 0, active: 0, concluded: 0, pending: 0 });
  const [clientCount, setClientCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [recentProcesses, setRecentProcesses] = useState<RecentProcess[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<RecentTask[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachProcessId, setAttachProcessId] = useState('');
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachUploading, setAttachUploading] = useState(false);
  const attachFileRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<RecentTask[]>([]);

  const handleDashboardAttach = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast({ title: 'Sessão expirada', variant: 'destructive' }); return; }
    if (!attachProcessId) { toast({ title: 'Selecione um processo', variant: 'destructive' }); return; }
    if (!attachFile) { toast({ title: 'Selecione um arquivo', variant: 'destructive' }); return; }
    setAttachUploading(true);
    try {
      await attachDocumentToProcess({
        userId: user.id,
        file: attachFile,
        processId: attachProcessId,
        description: 'Anexado via Dashboard',
        category: 'dashboard',
      });
      toast({ title: 'Documento anexado!', description: 'Vinculado ao processo/cliente.' });
      setAttachOpen(false);
      setAttachFile(null);
      setAttachProcessId('');
      if (attachFileRef.current) attachFileRef.current.value = '';
    } catch (e: any) {
      toast({ title: 'Erro ao anexar', description: e.message, variant: 'destructive' });
    } finally {
      setAttachUploading(false);
    }
  };

  useEffect(() => {
    async function loadDashboard() {
      try {
        const uid = user?.id;
        if (!uid) { setLoading(false); return; }

        // Process stats — use count queries (not page-limited)
        // Sprint E2E-fix #1+#4: filtros corrigidos para os valores reais do banco
        // ('em_andamento','concluido') e count: 'exact' (mais leve que 'exact').
        const [
          { count: totalCount },
          { count: activeCount },
          { count: concludedCount },
          { count: pendingCount },
          { count: clientTotal },
          { count: taskTotal },
          { data: recent },
          { data: upcoming },
          { data: workload },
          { data: members },
        ] = await Promise.all([
          supabase.from('processes').select('*', { count: 'exact', head: true }),
          supabase.from('processes').select('*', { count: 'exact', head: true })
            .in('status', ['em_andamento','aguardando']),
          supabase.from('processes').select('*', { count: 'exact', head: true })
            .in('status', ['concluido','arquivado']),
          supabase.from('processes').select('*', { count: 'exact', head: true })
            .eq('status', 'aguardando'),
          supabase.from('clients').select('*', { count: 'exact', head: true }),
          supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid)
            .eq('completed', false)
            .or('status.is.null,status.neq.cancelada')
            .not('assignee', 'eq', 'movimentacao')
            .not('assignee', 'eq', 'documento')
            .not('assignee', 'eq', 'agenda'),
          supabase.from('processes')
            .select('id, number, title, status, updated_at')
            .order('updated_at', { ascending: false })
            .limit(5),
          supabase.from('tasks')
            .select('id, title, due_date, completed, process_id, assignee, status')
            .eq('user_id', uid)
            .eq('completed', false)
            .or('status.is.null,status.neq.cancelada')
            .not('due_date', 'is', null)
            .not('assignee', 'eq', 'movimentacao')
            .not('assignee', 'eq', 'documento')
            .not('assignee', 'eq', 'agenda')
            .order('due_date', { ascending: true })
            .limit(8),
          supabase.from('tasks')
            .select('id, title, due_date, completed, process_id, assignee, status')
            .eq('user_id', uid)
            .eq('completed', false)
            .or('status.is.null,status.neq.cancelada')
            .gte('due_date', todayISO())
            .lte('due_date', new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10))
            .not('assignee', 'eq', 'movimentacao')
            .not('assignee', 'eq', 'documento')
            .not('assignee', 'eq', 'agenda'),
          supabase.rpc('list_team_members'),
        ]);

        setStats({
          total: totalCount ?? 0,
          active: activeCount ?? 0,
          concluded: concludedCount ?? 0,
          pending: pendingCount ?? 0,
        });
        setClientCount(clientTotal ?? 0);
        setTaskCount(taskTotal ?? 0);

        setRecentProcesses(recent ?? []);
        setUpcomingTasks((upcoming ?? []) as RecentTask[]);
        setTasks((workload ?? []) as RecentTask[]);
        setTeamMembers((members ?? []) as TeamMember[]);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, [user?.id]);

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    const d = iso.includes('T') ? iso : iso.slice(0,10) + 'T12:00:00';
    return new Date(d).toLocaleDateString('pt-BR');
  };

  const completionRate = stats.total > 0 ? Math.round((stats.concluded / stats.total) * 100) : 0;
  const avgPerClient = clientCount > 0 ? (stats.total / clientCount).toFixed(1) : '0';


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
    const loadMap = new Map<string, number>();
    (tasks as any[]).forEach((t) => {
      if (t.completed || t.status === 'cancelada' || !t.due_date) return;
      const key = `${t.assignee || '—'}|${String(t.due_date).slice(0, 10)}`;
      loadMap.set(key, (loadMap.get(key) ?? 0) + 1);
    });

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
  }, [loadDays, tasks, teamMembers]);

  const loadCellClass = (n: number) =>
    n === 0 ? 'text-stone-300 dark:text-muted-foreground/40'
      : n <= 2 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
        : n <= 4 ? 'bg-amber-50 text-amber-700 dark:bg-warning/15 dark:text-warning'
          : 'bg-red-50 text-red-700 font-bold dark:bg-destructive/15 dark:text-destructive';

  return (
    <div className="min-h-full bg-gradient-to-b from-background to-muted/30">
      <div className="p-8 max-w-[1400px] mx-auto space-y-8 animate-fade-in">
        {/* Editorial header */}
        <header className="flex items-end justify-between border-b border-border/60 pb-6">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.25em] text-primary/80 font-semibold">Painel Executivo</p>
            <h1 className="text-4xl font-display font-bold text-foreground tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">Visão consolidada do escritório · atualizado agora</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="default"
              onClick={() => setAttachOpen(true)}
              className="border-primary/40 text-primary hover:bg-primary/5"
            >
              <Paperclip className="h-4 w-4 mr-2" />
              Anexar Documento
            </Button>
            <Link to="/processos">
              <Button size="default" className="bg-gradient-to-r from-primary to-[hsl(var(--primary-glow))] text-primary-foreground shadow-[var(--shadow-gold)] hover:opacity-90 transition-all">
                <Plus className="h-4 w-4 mr-2" />
                Novo Processo
              </Button>
            </Link>
          </div>
        </header>

        {/* KPI Bento */}
        <section className="grid grid-cols-12 gap-4">
          {/* Featured KPI — Total Processos */}
          <Card className="col-span-12 md:col-span-6 lg:col-span-5 relative overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-accent/40 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
            <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)),transparent_60%)]" />
            <CardContent className="relative p-7">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Total de Processos</span>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-6xl font-display font-bold text-foreground tracking-tight tabular-nums">
                {loading ? '…' : stats.total.toLocaleString('pt-BR')}
              </p>
              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
                  {loading ? '…' : stats.active.toLocaleString('pt-BR')} ativos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                  {loading ? '…' : stats.concluded.toLocaleString('pt-BR')} concluídos
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Secondary KPIs */}
          <Card className="col-span-6 md:col-span-3 lg:col-span-2 border-border/60 bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">Ativos</span>
              </div>
              <p className="text-3xl font-display font-bold text-foreground tabular-nums">
                {loading ? '…' : stats.active.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">em andamento</p>
            </CardContent>
          </Card>

          <Card className="col-span-6 md:col-span-3 lg:col-span-2 border-border/60 bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">Clientes</span>
              </div>
              <p className="text-3xl font-display font-bold text-foreground tabular-nums">
                {loading ? '…' : clientCount.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{avgPerClient} processos/cliente</p>
            </CardContent>
          </Card>

          <Card className="col-span-12 md:col-span-6 lg:col-span-3 border-border/60 bg-gradient-to-br from-card to-[hsl(var(--warning))]/5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 text-[hsl(var(--warning))]">
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">Prazos Pendentes</span>
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="text-3xl font-display font-bold text-foreground tabular-nums">
                  {loading ? '…' : taskCount.toLocaleString('pt-BR')}
                </p>
                <Link to="/tarefas" className="text-[11px] text-primary hover:underline font-medium pb-1">Ver →</Link>
              </div>
            </CardContent>
          </Card>
        </section>


        {loadRows.length > 0 && (
          <section className="rounded-lg border border-stone-200 dark:border-border bg-white dark:bg-card overflow-hidden shadow-[var(--shadow-card)]">
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
          </section>
        )}

        {/* Two-column main */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Processes */}
          <Card className="border-border/60 bg-card shadow-[var(--shadow-card)]">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-foreground">
                <span className="flex items-center gap-2">
                  <span className="h-1 w-6 bg-primary rounded-full" />
                  <FileText className="h-4 w-4 text-primary" /> Processos Recentes
                </span>
                <Link to="/processos" className="text-xs font-medium text-primary hover:underline">Ver todos →</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <p className="text-sm text-muted-foreground p-6">Carregando…</p>
              ) : recentProcesses.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6">Nenhum processo encontrado.</p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {recentProcesses.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 px-6 py-4 hover:bg-accent/30 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate font-mono tabular-nums">{p.number || '—'}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{p.title ?? '—'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge className={`text-[10px] font-medium border-0 ${STATUS_COLORS[p.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{formatDate(p.updated_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Tasks */}
          <Card className="border-border/60 bg-card shadow-[var(--shadow-card)]">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-foreground">
                <span className="flex items-center gap-2">
                  <span className="h-1 w-6 bg-primary rounded-full" />
                  <Clock className="h-4 w-4 text-primary" /> Próximas Prazos
                </span>
                <Link to="/tarefas" className="text-xs font-medium text-primary hover:underline">Ver todas →</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <p className="text-sm text-muted-foreground p-6">Carregando…</p>
              ) : upcomingTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6">Nenhum prazo pendente.</p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {upcomingTasks.map((t) => {
                    const isOverdue = t.due_date && new Date(t.due_date.slice(0,10) + 'T12:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T12:00:00');
                    const isAgenda = (t as any).assignee === 'agenda';
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-6 py-4 hover:bg-accent/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isOverdue ? 'bg-destructive/10' : 'bg-muted'}`}>
                            <CheckSquare className={`h-3.5 w-3.5 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`} />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm truncate ${isOverdue ? 'text-destructive font-semibold' : 'text-foreground'}`}>{t.title}</p>
                            {isAgenda && <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">Agenda</span>}
                          </div>
                        </div>
                        <span className={`text-xs shrink-0 tabular-nums ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                          {formatDate(t.due_date)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Editorial summary strip */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/40 rounded-lg overflow-hidden border border-border/60">
          {[
            { label: 'Concluídos', value: loading ? '…' : stats.concluded.toLocaleString('pt-BR') },
            { label: 'Aguardando', value: loading ? '…' : stats.pending.toLocaleString('pt-BR') },
            { label: 'Taxa Conclusão', value: loading ? '…' : `${completionRate}%` },
            { label: 'Média / Cliente', value: loading ? '…' : avgPerClient },
          ].map((item) => (
            <div key={item.label} className="bg-card p-5 hover:bg-accent/30 transition-colors">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-2">{item.label}</p>
              <p className="text-2xl font-display font-bold text-foreground tabular-nums">{item.value}</p>
            </div>
          ))}
        </section>
      </div>

      {/* Dialog: anexar documento a um processo */}
      <Dialog open={attachOpen} onOpenChange={(o) => { if (!attachUploading) setAttachOpen(o); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader><DialogTitle>Anexar documento a um processo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Processo *</Label>
              <ProcessSearchSelect
                value={attachProcessId}
                onChange={setAttachProcessId}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Digite o número do processo, CPF/CNPJ ou nome do cliente.
              </p>
            </div>
            <div>
              <Label>Arquivo *</Label>
              <input
                ref={attachFileRef}
                type="file"
                className="mt-1 block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:font-semibold hover:file:opacity-90"
                onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Limite: 50 MB. O documento fica vinculado ao processo e à pasta do cliente.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)} disabled={attachUploading}>Cancelar</Button>
            <Button onClick={handleDashboardAttach} disabled={attachUploading || !attachProcessId || !attachFile}>
              {attachUploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</> : <><Paperclip className="h-4 w-4 mr-2" /> Anexar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
