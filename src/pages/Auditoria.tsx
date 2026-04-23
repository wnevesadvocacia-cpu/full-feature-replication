import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCanDelete } from '@/hooks/useUserRole';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ShieldCheck, Search, Plus, Pencil, Trash2, Eye } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit_logs'],
    enabled: !!user && canView,
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

  if (isLoading) {
    return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Auditoria
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Registro imutável de criações, edições e exclusões em dados sensíveis.
        </p>
      </div>

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
