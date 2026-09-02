import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Gauge, Download, AlertTriangle } from 'lucide-react';
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
type View = 'desempenho' | 'volume';

function bucketOf(iso: string, g: Granularity) {
  return g === 'mes' ? iso.slice(0, 7) : iso.slice(0, 10);
}

function fmtBucket(b: string, g: Granularity) {
  if (g === 'mes') {
    const [y, m] = b.split('-');
    return `${m}/${y}`;
  }
  const [, m, d] = b.split('-');
  return `${d}/${m}`;
}

function dayDiff(a: string, b: string) {
  const d1 = new Date(a.slice(0, 10) + 'T00:00:00').getTime();
  const d2 = new Date(b.slice(0, 10) + 'T00:00:00').getTime();
  return Math.round((d2 - d1) / 86400000);
}

function norm(v: string) {
  return v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Heurística: mesmo colaborador (e-mail do autor x nome do responsável). */
function samePerson(authorEmail: string | null, assignee: string | null) {
  if (!authorEmail || !assignee) return false;
  const local = norm(authorEmail.split('@')[0]);
  const name = norm(assignee);
  if (!local || !name) return false;
  if (local === name) return true;
  const nameTokens = name.split(' ').filter((t) => t.length > 2);
  const localTokens = local.split(' ').filter((t) => t.length > 2);
  const hits = nameTokens.filter((t) => local.includes(t)).length
    + localTokens.filter((t) => name.includes(t)).length;
  return hits >= 2;
}

interface Perf {
  who: string;
  executadas: number;
  noPrazo: number;
  comAtraso: number;
  semPrazo: number;
  delegadas: number;
  delegadasOutros: number;
  delegadasProprias: number;
  delegadasOutrosConcluidas: number;
  pendentes: number;
  pendentesAtrasadas: number;
  processos: number;
  leadDays: number[];
}

type Papel = 'Controller (delega)' | 'Executor' | 'Híbrido' | '—';

function papelOf(p: Perf): Papel {
  const total = p.executadas + p.delegadasOutros;
  if (total === 0) return '—';
  const shareDeleg = p.delegadasOutros / total;
  if (shareDeleg >= 0.7) return 'Controller (delega)';
  if (shareDeleg <= 0.3) return 'Executor';
  return 'Híbrido';
}

export default function Produtividade() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(past);
  const [to, setTo] = useState(today);
  const [gran, setGran] = useState<Granularity>('dia');
  const [view, setView] = useState<View>('desempenho');

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

  // Indicadores de desempenho por colaborador
  const perf = useMemo(() => {
    const map = new Map<string, Perf & { procSet: Set<string> }>();
    const get = (who: string) => {
      if (!map.has(who)) {
        map.set(who, {
          who, executadas: 0, noPrazo: 0, comAtraso: 0, semPrazo: 0, delegadas: 0,
          delegadasOutros: 0, delegadasProprias: 0, delegadasOutrosConcluidas: 0,
          pendentes: 0, pendentesAtrasadas: 0, processos: 0, leadDays: [], procSet: new Set(),
        });
      }
      return map.get(who)!;
    };

    for (const r of data) {
      const executor = r.completed_by_email || r.assignee || '—';
      const responsavel = r.assignee || r.completed_by_email || '—';
      const autor = r.created_by_email || r.assignee || '—';

      if (r.completed && r.completed_at) {
        const e = get(executor);
        e.executadas += 1;
        if (r.process_number) e.procSet.add(r.process_number);
        const done = r.completed_at.slice(0, 10);
        if (!r.due_date) e.semPrazo += 1;
        else if (done <= r.due_date) e.noPrazo += 1;
        else e.comAtraso += 1;
        e.leadDays.push(Math.max(0, dayDiff(r.created_at, r.completed_at)));
      } else if (!r.completed) {
        const p = get(responsavel);
        p.pendentes += 1;
        if (r.due_date && r.due_date < today) p.pendentesAtrasadas += 1;
        if (r.process_number) p.procSet.add(r.process_number);
      }

      const a = get(autor);
      a.delegadas += 1;
      if (samePerson(r.created_by_email, r.assignee)) {
        a.delegadasProprias += 1;
      } else {
        a.delegadasOutros += 1;
        if (r.completed) a.delegadasOutrosConcluidas += 1;
      }
    }

    return Array.from(map.values())
      .map((p) => ({ ...p, processos: p.procSet.size }))
      .sort((a, b) => b.executadas - a.executadas || a.who.localeCompare(b.who));
  }, [data, today]);

  const kpi = useMemo(() => {
    const executadas = perf.reduce((s, p) => s + p.executadas, 0);
    const noPrazo = perf.reduce((s, p) => s + p.noPrazo, 0);
    const comAtraso = perf.reduce((s, p) => s + p.comAtraso, 0);
    const pendentesAtrasadas = perf.reduce((s, p) => s + p.pendentesAtrasadas, 0);
    const lead = perf.flatMap((p) => p.leadDays);
    const comPrazo = noPrazo + comAtraso;
    return {
      executadas,
      sla: comPrazo ? Math.round((noPrazo / comPrazo) * 100) : null,
      comAtraso,
      pendentesAtrasadas,
      tmr: lead.length ? (lead.reduce((s, v) => s + v, 0) / lead.length) : null,
      colaboradores: perf.length,
    };
  }, [perf]);

  const slaOf = (p: Perf) => {
    const base = p.noPrazo + p.comAtraso;
    return base ? Math.round((p.noPrazo / base) * 100) : null;
  };
  const tmrOf = (p: Perf) =>
    p.leadDays.length ? p.leadDays.reduce((s, v) => s + v, 0) / p.leadDays.length : null;

  const slaBadge = (v: number | null) => {
    if (v === null) return 'bg-muted text-muted-foreground border-border';
    if (v >= 95) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (v >= 80) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-destructive/10 text-destructive border-destructive/30';
  };

  // Matriz de volume (heatmap): colaborador x período
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

  function exportCsv() {
    const head = view === 'desempenho'
      ? ['Colaborador', 'Executadas', 'No prazo', 'Com atraso', 'Sem prazo', '% no prazo', 'Tempo médio (dias)', 'Pendentes', 'Pendentes atrasadas', 'Processos', 'Delegadas/criadas']
      : ['Colaborador', ...buckets.map((b) => fmtBucket(b, gran)), 'Total executadas', 'Total delegadas/criadas'];
    const body = view === 'desempenho'
      ? perf.map((p) => {
          const sla = slaOf(p);
          const tmr = tmrOf(p);
          return [
            p.who, String(p.executadas), String(p.noPrazo), String(p.comAtraso), String(p.semPrazo),
            sla === null ? '—' : `${sla}%`, tmr === null ? '—' : tmr.toFixed(1),
            String(p.pendentes), String(p.pendentesAtrasadas), String(p.processos), String(p.delegadas),
          ];
        })
      : rows.map((r) => [r.who, ...r.cells.map((c) => `${c.done}/${c.created}`), String(r.totalDone), String(r.totalCreated)]);
    const csv = [head, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `produtividade-${view}-${from}_a_${to}.csv`;
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
            <Gauge className="h-6 w-6" /> Produtividade &amp; Compliance de Prazos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Indicadores de desempenho por colaborador: cumprimento de prazo, tempo médio de resposta, carga pendente e rastreamento de atividades.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={perf.length === 0}>
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
          <Button size="sm" variant={view === 'desempenho' ? 'default' : 'outline'} onClick={() => setView('desempenho')}>
            Desempenho
          </Button>
          <Button size="sm" variant={view === 'volume' ? 'default' : 'outline'} onClick={() => setView('volume')}>
            Volume por período
          </Button>
        </div>
        {view === 'volume' && (
          <div className="flex gap-1">
            {(['dia', 'mes'] as Granularity[]).map((g) => (
              <Button key={g} size="sm" variant={gran === g ? 'default' : 'outline'} onClick={() => setGran(g)}>
                {g === 'dia' ? 'Por dia' : 'Por mês'}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: 'Colaboradores', v: String(kpi.colaboradores), h: 'Pessoas com atividade no período' },
          { l: 'Tarefas executadas', v: String(kpi.executadas), h: 'Concluídas no período' },
          { l: '% cumprimento de prazo', v: kpi.sla === null ? '—' : `${kpi.sla}%`, h: 'Concluídas até o vencimento ÷ concluídas com prazo' },
          { l: 'Tempo médio de resposta', v: kpi.tmr === null ? '—' : `${kpi.tmr.toFixed(1)} d`, h: 'Dias entre criação e conclusão' },
          { l: 'Prazos vencidos em aberto', v: String(kpi.pendentesAtrasadas), h: 'Pendentes com vencimento passado' },
        ].map((s) => (
          <div key={s.l} className="bg-card border rounded-lg p-3" title={s.h}>
            <p className="text-xs text-muted-foreground">{s.l}</p>
            <p className="text-xl font-semibold">{s.v}</p>
          </div>
        ))}
      </div>

      {kpi.pendentesAtrasadas > 0 && (
        <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/5 text-destructive rounded-lg p-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {kpi.pendentesAtrasadas} prazo(s) com vencimento já passado ainda em aberto. Verifique os responsáveis na coluna “Vencidas em aberto”.
          </span>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{(error as any).message}</p>}

      {isLoading ? (
        <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : perf.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma atividade no período.</div>
      ) : view === 'desempenho' ? (
        <>
          <div className="bg-muted/40 border rounded-lg p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">Como ler</p>
            <p><span className="font-semibold text-foreground">Executadas</span>: tarefas concluídas pela pessoa. <span className="font-semibold text-foreground">No prazo</span> / <span className="font-semibold text-foreground">Com atraso</span>: comparação da data de conclusão com o vencimento.</p>
            <p><span className="font-semibold text-foreground">% no prazo</span>: indicador de compliance (verde ≥ 95%, âmbar ≥ 80%, vermelho abaixo). <span className="font-semibold text-foreground">Tempo médio</span>: dias entre a criação e a conclusão da tarefa.</p>
            <p><span className="font-semibold text-foreground">Delegadas/criadas</span>: tarefas cadastradas pela pessoa (podem ter sido atribuídas a outros) — mede coordenação, não execução.</p>
          </div>

          <div className="border rounded-lg overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2 sticky left-0 bg-muted/50">Colaborador</th>
                  <th className="p-2 text-center">Executadas</th>
                  <th className="p-2 text-center">No prazo</th>
                  <th className="p-2 text-center">Com atraso</th>
                  <th className="p-2 text-center">% no prazo</th>
                  <th className="p-2 text-center whitespace-nowrap">Tempo médio</th>
                  <th className="p-2 text-center">Pendentes</th>
                  <th className="p-2 text-center whitespace-nowrap">Vencidas em aberto</th>
                  <th className="p-2 text-center">Processos</th>
                  <th className="p-2 text-center whitespace-nowrap">Delegadas/criadas</th>
                </tr>
              </thead>
              <tbody>
                {perf.map((p) => {
                  const sla = slaOf(p);
                  const tmr = tmrOf(p);
                  return (
                    <tr key={p.who} className="border-t">
                      <td className="p-2 whitespace-nowrap sticky left-0 bg-card font-medium">{p.who}</td>
                      <td className="p-2 text-center font-semibold">{p.executadas}</td>
                      <td className="p-2 text-center text-emerald-700">{p.noPrazo}</td>
                      <td className={`p-2 text-center ${p.comAtraso > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>{p.comAtraso}</td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className={`${slaBadge(sla)} text-[10px]`}>
                          {sla === null ? 'sem prazo' : `${sla}%`}
                        </Badge>
                      </td>
                      <td className="p-2 text-center whitespace-nowrap">{tmr === null ? '—' : `${tmr.toFixed(1)} d`}</td>
                      <td className="p-2 text-center">{p.pendentes}</td>
                      <td className={`p-2 text-center ${p.pendentesAtrasadas > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>{p.pendentesAtrasadas}</td>
                      <td className="p-2 text-center">{p.processos}</td>
                      <td className="p-2 text-center text-muted-foreground">{p.delegadas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="bg-muted/40 border rounded-lg p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">Como ler esta tabela</p>
            <p>Cada linha é um colaborador e cada coluna um {gran === 'mes' ? 'mês' : 'dia'} do período.</p>
            <p>
              <span className="font-semibold text-foreground">✔ executou</span> = tarefas concluídas pela pessoa;
              {' '}<span className="font-semibold text-foreground">+ delegou/criou</span> = tarefas cadastradas por ela (para si ou para outros). Os números são independentes.
            </p>
          </div>

          <div className="border rounded-lg overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2 sticky left-0 bg-muted/50">Colaborador</th>
                  {buckets.map((b) => (
                    <th key={b} className="p-2 whitespace-nowrap text-center">
                      {fmtBucket(b, gran)}
                      <div className="text-[10px] font-normal opacity-70">✔ executou · + delegou</div>
                    </th>
                  ))}
                  <th className="p-2 text-center whitespace-nowrap">Total executadas</th>
                  <th className="p-2 text-center whitespace-nowrap">Total delegadas/criadas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.who} className="border-t">
                    <td className="p-2 whitespace-nowrap sticky left-0 bg-card">{r.who}</td>
                    {r.cells.map((c, i) => (
                      <td
                        key={buckets[i]}
                        title={`${r.who} — ${fmtBucket(buckets[i], gran)}: executou ${c.done}, delegou/criou ${c.created}`}
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
