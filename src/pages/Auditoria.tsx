import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCanDelete } from '@/hooks/useUserRole';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ShieldCheck, Search, Plus, Pencil, Trash2, Eye, ListChecks, ClipboardList, CheckCircle2, XCircle, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id: string | null;
  old_data: any;
  new_data: any;
  changed_fields: string[] | null;
  created_at: string;
}

interface TaskAudit {
  id: string;
  title: string;
  completed: boolean;
  status: string;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  assignee: string | null;
  process_id: string | null;
  processes?: { number: string } | null;
}

const TABLE_LABEL: Record<string, string> = {
  clients: 'Clientes',
  processes: 'Processos',
  invoices: 'Faturas',
  intimations: 'Intimações',
  documents: 'Documentos',
  fee_agreements: 'Honorários',
  expenses: 'Despesas',
  time_entries: 'Timesheet',
  tasks: 'Tarefas',
  signature_requests: 'Assinaturas',
  user_roles: 'Permissões',
  document_versions: 'Versões de petição',
  document_templates: 'Modelos',
  client_portal_tokens: 'Portal do cliente',
};

const ACTION_LABEL: Record<string, { label: string; cls: string; Icon: any }> = {
  INSERT: { label: 'Criação', cls: 'bg-success/10 text-success', Icon: Plus },
  UPDATE: { label: 'Edição', cls: 'bg-primary/10 text-primary', Icon: Pencil },
  DELETE: { label: 'Exclusão', cls: 'bg-destructive/10 text-destructive', Icon: Trash2 },
};

export default function Auditoria() {
  const { user } = useAuth();
  const canView = useCanDelete();
  const [activeTab, setActiveTab] = useState<'logs' | 'tasks'>('logs');
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit_logs'],
    enabled: !!user && canView && activeTab === 'logs',
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as AuditLog[];
    },
  });

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const tomorrowStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const { data: todayTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ['audit_today_tasks', user?.id, todayStart],
    enabled: !!user && activeTab === 'tasks',
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('tasks')
        .select('id, title, completed, status, start_date, due_date, created_at, assignee, process_id, processes(number)')
        .eq('user_id', user!.id)
        .gte('created_at', todayStart)
        .lt('created_at', tomorrowStart)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as TaskAudit[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (tableFilter !== 'all' && l.table_name !== tableFilter) return false;
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (!s) return true;
      return (
        (l.user_email || '').toLowerCase().includes(s) ||
        (l.record_id || '').toLowerCase().includes(s) ||
        l.table_name.toLowerCase().includes(s)
      );
    });
  }, [logs, search, tableFilter, actionFilter]);

  if (!canView) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-display font-bold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Apenas administradores e gerentes podem acessar o registro de auditoria.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Auditoria
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Verificação de logs e tarefas criadas.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-hairline pb-0">
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'logs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ClipboardList className="h-4 w-4" /> Logs de Auditoria
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'tasks'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ListChecks className="h-4 w-4" /> Minhas Tarefas de Hoje
        </button>
      </div>

      {/* LOGS TAB */}
      {activeTab === 'logs' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por usuário, tabela ou ID…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger><SelectValue placeholder="Tabela" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as tabelas</SelectItem>
                {Object.entries(TABLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                <SelectItem value="INSERT">Criação</SelectItem>
                <SelectItem value="UPDATE">Edição</SelectItem>
                <SelectItem value="DELETE">Exclusão</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="bg-card border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Quando</th>
                      <th className="text-left p-3">Usuário</th>
                      <th className="text-left p-3">Ação</th>
                      <th className="text-left p-3">Tabela</th>
                      <th className="text-left p-3">Registro</th>
                      <th className="text-left p-3">Campos alterados</th>
                      <th className="text-right p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum registro de auditoria.</td></tr>
                    )}
                    {filtered.map((l) => {
                      const A = ACTION_LABEL[l.action] || ACTION_LABEL.UPDATE;
                      return (
                        <tr key={l.id} className="border-t hover:bg-muted/30">
                          <td className="p-3 whitespace-nowrap">
                            {format(new Date(l.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                          </td>
                          <td className="p-3">
                            <div className="font-medium">{l.user_email || '—'}</div>
                            <div className="text-xs text-muted-foreground font-mono">{l.user_id?.slice(0, 8) || ''}</div>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${A.cls}`}>
                              <A.Icon className="h-3 w-3" /> {A.label}
                            </span>
                          </td>
                          <td className="p-3">{TABLE_LABEL[l.table_name] || l.table_name}</td>
                          <td className="p-3 font-mono text-xs">{l.record_id?.slice(0, 8) || '—'}</td>
                          <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">
                            {l.changed_fields?.length ? l.changed_fields.join(', ') : '—'}
                          </td>
                          <td className="p-3 text-right">
                            <button onClick={() => setDetail(l)} className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                              <Eye className="h-3 w-3" /> Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* TASKS TAB */}
      {activeTab === 'tasks' && (
        <>
          {isLoadingTasks ? (
            <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="bg-card border rounded-lg overflow-hidden">
              <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {todayTasks.length} tarefa{todayTasks.length !== 1 ? 's' : ''} criada{todayTasks.length !== 1 ? 's' : ''} hoje
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Período: {format(new Date(todayStart), "dd/MM/yyyy")} 00:00 — {format(new Date(tomorrowStart), "dd/MM/yyyy")} 00:00
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  User ID: <span className="font-mono">{user?.id?.slice(0, 8)}…</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Título</th>
                      <th className="text-left p-3">Completed</th>
                      <th className="text-left p-3">Start Date</th>
                      <th className="text-left p-3">Due Date</th>
                      <th className="text-left p-3">Criado em</th>
                      <th className="text-left p-3">Responsável</th>
                      <th className="text-left p-3">Processo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayTasks.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          <div className="space-y-2">
                            <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/50" />
                            <p className="font-medium">Nenhuma tarefa criada hoje</p>
                            <p className="text-xs max-w-md mx-auto">
                              Não foram encontradas tarefas criadas por você nesta data.
                              Isso pode indicar que a tarefa foi criada em outro dia,
                              ou que há um problema de gravação/RLS.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                    {todayTasks.map((t) => (
                      <tr key={t.id} className="border-t hover:bg-muted/30">
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                            t.completed
                              ? 'bg-success/10 text-success'
                              : 'bg-warning/10 text-warning'
                          }`}>
                            {t.completed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {t.status || (t.completed ? 'concluída' : 'pendente')}
                          </span>
                        </td>
                        <td className="p-3 font-medium max-w-xs truncate" title={t.title}>
                          {t.title}
                        </td>
                        <td className="p-3">
                          {t.completed ? (
                            <span className="text-success font-medium text-xs">Sim</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Não</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {t.start_date ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <Calendar className="h-3 w-3 text-primary" />
                              {format(new Date(t.start_date + 'T12:00:00'), 'dd/MM/yyyy')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {t.due_date ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <Calendar className="h-3 w-3 text-destructive" />
                              {format(new Date(t.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {format(new Date(t.created_at), 'dd/MM/yyyy HH:mm:ss')}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {t.assignee || '—'}
                        </td>
                        <td className="p-3 text-xs font-mono">
                          {t.processes?.number ? (
                            <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                              #{t.processes.number}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhe do evento</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-xs text-muted-foreground">Quando</div><div>{format(new Date(detail.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</div></div>
                <div><div className="text-xs text-muted-foreground">Usuário</div><div>{detail.user_email || '—'}</div></div>
                <div><div className="text-xs text-muted-foreground">Ação</div><div>{ACTION_LABEL[detail.action]?.label}</div></div>
                <div><div className="text-xs text-muted-foreground">Tabela</div><div>{TABLE_LABEL[detail.table_name] || detail.table_name}</div></div>
                <div className="col-span-2"><div className="text-xs text-muted-foreground">ID do registro</div><div className="font-mono text-xs">{detail.record_id || '—'}</div></div>
              </div>

              {detail.changed_fields?.length ? (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Campos alterados</div>
                  <div className="flex flex-wrap gap-1">
                    {detail.changed_fields.map((f) => (
                      <span key={f} className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{f}</span>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.old_data && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Dados antes</div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-64">{JSON.stringify(detail.old_data, null, 2)}</pre>
                </div>
              )}
              {detail.new_data && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Dados depois</div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-64">{JSON.stringify(detail.new_data, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
