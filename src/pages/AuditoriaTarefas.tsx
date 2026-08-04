import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ClipboardList, Download } from 'lucide-react';
import { DateInputBR } from '@/components/DateInputBR';

interface AuditRow {
  id: string;
  title: string;
  status: string | null;
  completed: boolean;
  priority: string | null;
  due_date: string | null;
  start_date: string | null;
  assignee: string | null;
  created_by_email: string | null;
  completed_by_email: string | null;
  created_at: string;
  completed_at: string | null;
  process_number: string | null;
  process_id: string | null;
}

function fmtDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  return d.toLocaleDateString('pt-BR');
}

function statusLabel(r: AuditRow) {
  if (r.completed) return { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (r.status === 'em_elaboracao') return { label: 'Em elaboração', cls: 'bg-blue-100 text-blue-700 border-blue-200' };
  return { label: 'Pendente', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
}

export default function AuditoriaTarefas() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const past = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(past);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState('');

  const { data = [], isLoading, error } = useQuery<AuditRow[]>({
    queryKey: ['task-audit', from, to],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('list_task_audit', {
        _from: from || null,
        _to: to || null,
        _limit: 2000,
      });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data;
    return data.filter((r) =>
      [r.title, r.assignee, r.created_by_email, r.process_number, r.completed_by_email]
        .some((v) => (v ?? '').toLowerCase().includes(term)),
    );
  }, [data, q]);

  const stats = useMemo(() => ({
    total: rows.length,
    concluidas: rows.filter((r) => r.completed).length,
    pendentes: rows.filter((r) => !r.completed).length,
    atrasadas: rows.filter((r) => !r.completed && r.due_date && r.due_date < today).length,
  }), [rows, today]);

  function exportCsv() {
    const head = ['Tarefa', 'Processo', 'Responsável', 'Delegada por', 'Criada em', 'Início', 'Vencimento', 'Status', 'Concluída por', 'Concluída em'];
    const body = rows.map((r) => [
      r.title, r.process_number ?? '', r.assignee ?? '', r.created_by_email ?? '',
      fmtDate(r.created_at), fmtDate(r.start_date), fmtDate(r.due_date),
      statusLabel(r).label, r.completed_by_email ?? '', fmtDate(r.completed_at),
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-tarefas-${from}_a_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> Auditoria de Tarefas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Tarefas agendadas/delegadas do escritório, com autor, responsável, prazos e conclusão.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">De</label>
          <DateInputBR value={from} onChange={(v) => setFrom(v)} className="h-9 w-[150px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Até</label>
          <DateInputBR value={to} onChange={(v) => setTo(v)} className="h-9 w-[150px]" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-muted-foreground">Buscar</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tarefa, responsável, processo…" className="h-9" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Total', v: stats.total },
          { l: 'Pendentes', v: stats.pendentes },
          { l: 'Concluídas', v: stats.concluidas },
          { l: 'Atrasadas', v: stats.atrasadas },
        ].map((s) => (
          <div key={s.l} className="bg-card border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{s.l}</p>
            <p className="text-xl font-semibold">{s.v}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{(error as any).message}</p>}

      {isLoading ? (
        <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma tarefa no período.</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Tarefa</th>
                <th className="text-left p-2">Processo</th>
                <th className="text-left p-2">Responsável</th>
                <th className="text-left p-2">Delegada por</th>
                <th className="text-left p-2">Criada</th>
                <th className="text-left p-2">Vencimento</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Concluída por</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = statusLabel(r);
                const late = !r.completed && r.due_date && r.due_date < today;
                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-2 max-w-[280px]">{r.title}</td>
                    <td className="p-2 whitespace-nowrap">{r.process_number ?? '—'}</td>
                    <td className="p-2">{r.assignee ?? '—'}</td>
                    <td className="p-2">{r.created_by_email ?? '—'}</td>
                    <td className="p-2 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className={`p-2 whitespace-nowrap ${late ? 'text-destructive font-medium' : ''}`}>{fmtDate(r.due_date)}</td>
                    <td className="p-2"><Badge variant="outline" className={`${st.cls} text-[10px]`}>{st.label}</Badge></td>
                    <td className="p-2">
                      {r.completed_by_email ?? '—'}
                      {r.completed_at && <div className="text-xs text-muted-foreground">{fmtDate(r.completed_at)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
