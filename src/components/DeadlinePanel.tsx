// Painel de prazo processual "nível sênior" — camadas hierárquicas:
//   (1) badge com contagem regressiva colorida (verde/amarelo/vermelho/cinza)
//   (2) linha de decisão (tipo · vencimento · fundamento)
//   (3) chips legais (CPC 219, Lei 11.419/2006 art. 4º §§3º e 4º, dispositivo específico)
//   (4) memorial expansível (disponibilização → publicação → início → +N d.u. → vencimento)
//   (5) lista de dias pulados no período (sábado, domingo, feriado CNJ, feriado tribunal, suspensão, recesso)
//
// Reusa o motor já existente (detectDeadline + cnjCalendar). Puramente apresentacional.

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Gavel, ScrollText, CalendarClock, AlertOctagon, ShieldAlert } from 'lucide-react';
import { formatBR, getCalendarExclusion, nextBusinessDay } from '@/lib/cnjCalendar';
import { deadlineCountingBasis, type DetectedDeadline } from '@/lib/legalDeadlines';
import { Button } from '@/components/ui/button';

interface Props {
  deadline: DetectedDeadline;
  suggestionApproved?: boolean;
  receivedAtISO: string;   // data de disponibilização (YYYY-MM-DD)
  tribunal?: string | null; // sigla p/ feriados estaduais (opcional)
}

type SkipReason = 'sabado' | 'domingo' | 'feriado_cnj' | 'recesso' | 'feriado_local' | 'suspensao';
interface SkippedDay { iso: string; reason: SkipReason; label: string; }

const SKIP_LABELS: Record<SkipReason, string> = {
  sabado: 'Sábado', domingo: 'Domingo', recesso: 'Suspensão legal de 20/12 a 20/01',
  feriado_cnj: 'Feriado do calendário-base CNJ', feriado_local: 'Feriado cadastrado do tribunal',
  suspensao: 'Suspensão cadastrada aplicável ao tribunal',
};

function eachDayISO(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + 'T12:00:00Z');
  const e = new Date(end + 'T12:00:00Z');
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const SEV = {
  expired:  { chip: 'bg-destructive text-destructive-foreground border-destructive', dot: 'bg-destructive', text: 'text-destructive', label: 'VENCIDO' },
  critical: { chip: 'bg-destructive/15 text-destructive border-destructive/40', dot: 'bg-destructive', text: 'text-destructive', label: 'URGENTE' },
  warning:  { chip: 'bg-warning/20 text-warning-foreground border-warning/50', dot: 'bg-warning', text: 'text-warning', label: 'ATENÇÃO' },
  normal:   { chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', label: 'NO PRAZO' },
} as const;

export function DeadlinePanel({ deadline, receivedAtISO, tribunal, suggestionApproved = false }: Props) {
  // extrai a parte "extra" do baseLegal (o motivo por trás do fundamento primário)
  const baseLegalExtra = (d: DetectedDeadline) => {
    const primary = `${d.source} ${d.article}`;
    return d.baseLegal.replace(primary, '').replace(/^\s*·\s*/, '').trim();
  };
  // shim para preservar assinatura na JSX abaixo
  const [open, setOpen] = useState(false);
  const sev = SEV[deadline.severity];
  const unitLabel = deadline.unit === 'dias_uteis' ? 'dias úteis' : 'dias corridos';
  const publicacao = useMemo(() => nextBusinessDay(receivedAtISO, { tribunal: tribunal ?? undefined, ignoreRecess: deadline.ignoreRecess }), [receivedAtISO, tribunal, deadline.ignoreRecess]);
  const countingBasis = deadlineCountingBasis(deadline.source, deadline.unit);

  const skipped: SkippedDay[] = useMemo(() => {
    if (!deadline.startDate || !deadline.dueDate || deadline.unit !== 'dias_uteis') return [];
    return eachDayISO(receivedAtISO, deadline.dueDate).flatMap(iso => {
      const reason = getCalendarExclusion(iso, { tribunal: tribunal ?? undefined, ignoreRecess: deadline.ignoreRecess });
      return reason ? [{ iso, reason, label: SKIP_LABELS[reason] }] : [];
    });
  }, [receivedAtISO, deadline.startDate, deadline.dueDate, deadline.unit, deadline.ignoreRecess, tribunal]);

  const hasLocalHoliday = skipped.some(s => s.reason === 'feriado_local' || s.reason === 'suspensao');
  const remaining = deadline.severity === 'expired'
    ? `Vencido há ${Math.abs(deadline.businessDaysLeft)} d.u.`
    : deadline.businessDaysLeft === 0 ? 'Vence hoje'
    : deadline.businessDaysLeft === 1 ? 'Vence amanhã'
    : `${deadline.businessDaysLeft} d.u. restantes`;

  if (deadline.triggerSource === 'pauta' || deadline.days === 0) return null;

  return (
    <div className="mt-3 border-y border-border overflow-hidden">
      {/* Cabeçalho de decisão rápida */}
      <div className="p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold uppercase tracking-wide ${sev.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${sev.dot} ${deadline.severity === 'critical' || deadline.severity === 'expired' ? 'animate-pulse' : ''}`} />
            {sev.label}
          </span>
          <span className={`text-sm font-semibold ${sev.text}`}>{remaining}</span>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Vencimento:</span>
          <span className="font-semibold">{deadline.dueDate ? formatBR(deadline.dueDate) : '—'}</span>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <Gavel className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{suggestionApproved ? 'Tarefa:' : 'Prazo:'}</span>
          {suggestionApproved && <span className="font-medium">{deadline.label}</span>}
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-xs">{deadline.days}{deadline.doubled ? ' (2x)' : ''} {deadline.unit === 'dias_uteis' ? 'd.u.' : 'd.c.'}</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => setOpen(v => !v)}
          className="ml-auto h-7 gap-1 text-xs text-muted-foreground"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Memorial de cálculo
        </Button>
      </div>

      {/* Chips legais */}
      {open && <div className="px-3 pb-3 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-muted/60 text-[11px] font-mono">
          <ScrollText className="h-3 w-3" /> {deadline.source} {deadline.article}
        </span>
        {(
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-muted/60 text-[11px] font-mono">
            {countingBasis}
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-muted/60 text-[11px] font-mono">
          Lei 11.419/2006 art. 4º §§3º–4º · DJe
        </span>
        {deadline.doubled && deadline.doubleReasons?.map((r) => (
          <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-primary/10 text-primary border-primary/40 text-[11px] font-mono">
            2x · {r}
          </span>
        ))}
        {deadline.doubleWaivedReason && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-warning/60 bg-warning/10 text-warning text-[11px] font-semibold">
            <AlertOctagon className="h-3 w-3" /> Dobro afastado · CPC art. 229 §2º
          </span>
        )}
        {hasLocalHoliday && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-warning/60 bg-warning/15 text-warning text-[11px] font-semibold">
            <AlertOctagon className="h-3 w-3" /> Feriados/suspensões cadastrados aplicados
          </span>
        )}
      </div>}
      <p className="px-3 pb-2 text-xs text-muted-foreground">{countingBasis} · Calendário-base CNJ{tribunal ? ` + datas cadastradas do ${tribunal}` : ' · tribunal não identificado'}.</p>
      <p className="px-3 pb-2 text-xs text-foreground"><span className="font-medium text-destructive">Ressalva:</span> feriado da comarca ou suspensão ainda não cadastrados podem alterar o vencimento; confirme no calendário do {tribunal || 'tribunal competente'}.</p>
      {!open && deadline.classificacaoStatus !== 'auto_alta' && deadline.classificacaoStatus !== 'revisada_advogado' && <p className="px-3 pb-2 text-xs text-warning">Confirme a modalidade do ato e o destinatário no inteiro teor.</p>}

      {/* Memorial expansível */}
      {open && (
        <div className="border-t bg-muted/30 px-3 py-3 space-y-3 text-xs">
          <div>
            <div className="font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Memorial de cálculo</div>
            <ol className="space-y-1 list-decimal list-inside">
              <li><strong>Disponibilização (DJe):</strong> {formatBR(receivedAtISO)}</li>
              <li><strong>Publicação:</strong> {formatBR(publicacao)} <span className="text-muted-foreground">(1º dia útil seguinte · Lei 11.419/2006 art. 4º §3º)</span></li>
              {deadline.startDate && (
                <li><strong>Primeiro dia contado:</strong> {formatBR(deadline.startDate)} <span className="text-muted-foreground">(1º dia útil seguinte à publicação · Lei 11.419/2006 art. 4º §4º)</span></li>
              )}
              <li><strong>Prazo legal:</strong> {deadline.days} {unitLabel}{deadline.doubled ? ' (em dobro)' : ''} <span className="text-muted-foreground">— artigo do prazo: {deadline.source} {deadline.article}</span></li>
              <li><strong>Forma de contagem:</strong> {countingBasis}. {deadline.unit === 'dias_corridos' ? 'Fins de semana e feriados intermediários são contados; vencimento sem expediente prorroga para o próximo dia útil.' : 'Fins de semana, feriados e suspensões aplicáveis não são contados.'} {deadline.source === 'CPP' && (deadline.ignoreRecess ? 'Exceção expressa à suspensão de 20/12 a 20/01 identificada no ato (art. 798-A).' : 'Suspensão de 20/12 a 20/01 aplicada (art. 798-A); exceções legais exigem conferência do ato.')}</li>
              {deadline.doubled && deadline.doubleReasons && (
                <li><strong>Prazo em dobro:</strong> {deadline.doubleReasons.join(' + ')}</li>
              )}
              {deadline.doubleWaivedReason && (
                <li className="text-warning"><strong>Dobro afastado:</strong> {deadline.doubleWaivedReason}</li>
              )}
              {baseLegalExtra(deadline) && (
                <li><strong>Fundamento adicional:</strong> {baseLegalExtra(deadline)}</li>
              )}
              {deadline.dueDate && (
                <li><strong>Vencimento (dies ad quem):</strong> <span className={`font-semibold ${sev.text}`}>{formatBR(deadline.dueDate)}</span> — {remaining}</li>
              )}
            </ol>
          </div>

          {skipped.length > 0 && (
            <div>
              <div className="font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Dias não computados no período ({skipped.length})
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {skipped.map(s => (
                  <li key={s.iso} className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      s.reason === 'feriado_local' || s.reason === 'suspensao' ? 'bg-warning'
                      : s.reason === 'feriado_cnj' || s.reason === 'recesso' ? 'bg-primary'
                      : 'bg-muted-foreground/50'
                    }`} />
                    <span className="font-mono">{formatBR(s.iso)}</span>
                    <span className="text-muted-foreground">— {s.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {deadline.classificacaoStatus !== 'auto_alta' && deadline.classificacaoStatus !== 'revisada_advogado' && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-warning">
              <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Classificação {deadline.classificacaoStatus.replace('_', ' ')} (confiança {(deadline.confianca * 100).toFixed(0)}%). Confirme o prazo no dispositivo antes de protocolar.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
