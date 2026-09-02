import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, Gauge, Download } from 'lucide-react';
import { DateInputBR } from '@/components/DateInputBR';

interface AuditRow {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  assignee: string | null;
  created_by_email: string | null;
  completed_by_email: string | null;
  created_at: string;
  completed_at: string | null;
  process_number: string | null;
}

type Granularity = 'dia' | 'mes';

function bucketOf(iso: string, g: Granularity) {
  return g === 'mes' ? iso.slice(0, 7) : iso.slice(0, 10);
}

function fmtBucket(b: string, g: Granularity) {
  if (g === 'mes') {
    const [y, m] = b.split('-');
    return `${m}/${y}`;
  }
  const [y, m, d] = b.split('-');
  return `${d}/${m}`;
}

export default function Produtividade() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(past);
  const [to, setTo] = useState(today);
  const [gran, setGran] = useState<Granularity>('dia');

  const { data = [], isLoading, error } = useQuery<AuditRow[]>({
    queryKey: ['produtividade', from, to],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('list_task_audit', {
        _from: from || null,
        _to: to || null,
        _limit: 5000,
      });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  // Matriz: colaborador x período (concluídas por quem concluiu; criadas por autor)
  const { buckets, rows } = useMemo(() => {
    const bucketSet = new Set<string>();
    const map = new Map<string, Map<string, { done: number; created: number }>>();

    const touch = (who: string, b: string) => {
      if (!map.has(who)) map.set(who, new Map());
      const m = map.get(who)!;
      if (!m.has(b)) m.set(b, { done: 0, created: 0 });
      return m.get(b)!;
    };

    for (const r of data) {
      if (r.completed && r.completed_at) {
        const who = r.completed_by_email || r.assignee || '—';
        const b = bucketOf(r.completed_at, gran);
        bucketSet.add(b);
        touch(who, b).done += 1;
      }
      const author = r.created_by_email || r.assignee || '—';
      const cb = bucketOf(r.created_at, gran);
      bucketSet.add(cb);
      touch(author, cb).created += 1;
    }

    const buckets = Array.from(bucketSet).sort();
    const rows = Array.from(map.entries())
      .map(([who, m]) => {
        const cells = buckets.map((b) => m.get(b) ?? { done: 0, created: 0 });
        return {
          who,
          cells,
          totalDone: cells.reduce((s, c) => s + c.done, 0),
          totalCreated: cells.reduce((s, c) => s + c.created, 0),
        };
      })
      .sort((a, b) => b.totalDone - a.totalDone || a.who.localeCompare(b.who));

    return { buckets, rows };
  }, [data, gran]);

  const totals = useMemo(() => ({
    done: rows.reduce((s, r) => s + r.totalDone, 0),
    created: rows.reduce((s, r) => s + r.totalCreated, 0),
    colaboradores: rows.length,
  }), [rows]);

  function exportCsv() {
    const head = ['Colaborador', ...buckets.map((b) => fmtBucket(b, gran)), 'Total concluídas', 'Total criadas'];
    const body = rows.map((r) => [
      r.who,
      ...r.cells.map((c) => `${c.done}/${c.created}`),
      String(r.totalDone),
      String(r.totalCreated),
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `produtividade-${gran}-${from}_a_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cellCls = (done: number) =>
    done === 0 ? 'text-muted-foreground'
      : done <= 2 ? 'bg-emerald-50 text-emerald-700'
      : done <= 5 ? 'bg-amber-50 text-amber-700'
      : 'bg-primary/10 text-primary font-semibold';

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Gauge className="h-6 w-6" /> Produtividade
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Atividades por colaborador e período — concluídas / criadas, para auditoria e rastreamento.
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
        <div className="flex gap-1">
          {(['dia', 'mes'] as Granularity[]).map((g) => (
            <Button key={g} size="sm" variant={gran === g ? 'default' : 'outline'} onClick={() => setGran(g)}>
              {g === 'dia' ? 'Por dia' : 'Por mês'}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { l: 'Colaboradores', v: totals.colaboradores },
          { l: 'Concluídas', v: totals.done },
          { l: 'Criadas/Delegadas', v: totals.created },
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
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma atividade no período.</div>
      ) : (
        <>
          <div className="bg-muted/40 border rounded-lg p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">Como ler esta tabela</p>
            <p>Cada linha é um colaborador. Cada coluna é um {gran === 'mes' ? 'mês' : 'dia'} do período escolhido.</p>
            <p>
              Dentro de cada célula aparecem dois números independentes:
              {' '}<span className="font-semibold text-foreground">✔ Executou</span> = tarefas que a própria pessoa concluiu;
              {' '}<span className="font-semibold text-foreground">+ Delegou/criou</span> = tarefas que a pessoa cadastrou, podendo ter sido atribuídas a ela mesma ou a outro colaborador.
            </p>
            <p>Exemplo: <span className="font-semibold text-foreground">✔ 34 · + 3</span> = concluiu 34 tarefas e cadastrou 3 tarefas (que podem ter sido delegadas a outra pessoa).</p>
            <p className="text-foreground/80">Os dois números não se somam e não se cancelam: quem delega muito pode ter "+" alto e "✔" baixo, e quem executa muito pode ter "✔" alto e "+" baixo.</p>
            <p>Quanto mais forte a cor da célula, maior o número de tarefas concluídas naquele período.</p>
          </div>

          <div className="border rounded-lg overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2 sticky left-0 bg-muted/50">Colaborador</th>
                  {buckets.map((b) => (
                    <th key={b} className="p-2 whitespace-nowrap text-center">
                      {fmtBucket(b, gran)}
                      <div className="text-[10px] font-normal opacity-70">✔ concl. · + criad.</div>
                    </th>
                  ))}
                  <th className="p-2 text-center whitespace-nowrap">Total concluídas</th>
                  <th className="p-2 text-center whitespace-nowrap">Total criadas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.who} className="border-t">
                    <td className="p-2 whitespace-nowrap sticky left-0 bg-card">{r.who}</td>
                    {r.cells.map((c, i) => (
                      <td
                        key={buckets[i]}
                        title={`${r.who} — ${fmtBucket(buckets[i], gran)}: ${c.done} concluída(s), ${c.created} criada(s)`}
                        className={`p-2 text-center whitespace-nowrap ${cellCls(c.done)}`}
                      >
                        ✔ {c.done}<span className="text-[11px] opacity-70"> · + {c.created}</span>
                      </td>
                    ))}
                    <td className="p-2 text-center font-semibold whitespace-nowrap">{r.totalDone}</td>
                    <td className="p-2 text-center font-semibold whitespace-nowrap">{r.totalCreated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
