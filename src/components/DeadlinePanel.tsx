// Painel de prazo processual "nível sênior" — camadas hierárquicas:
//   (1) badge com contagem regressiva colorida (verde/amarelo/vermelho/cinza)
//   (2) linha de decisão (tipo · vencimento · fundamento)
//   (3) chips legais (CPC 219, Lei 11.419/2006 art. 4º §§3º e 4º, dispositivo específico)
//   (4) memorial expansível (disponibilização → publicação → início → +N d.u. → vencimento)
//   (5) lista de dias pulados no período (sábado, domingo, feriado CNJ, feriado tribunal, suspensão, recesso)
//
// Reusa o motor já existente (detectDeadline + cnjCalendar). Puramente apresentacional.

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Gavel, ScrollText, CalendarClock, AlertOctagon, ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatBR, isBusinessDay, nextBusinessDay, getCnjHolidays } from '@/lib/cnjCalendar';
import type { DetectedDeadline } from '@/lib/legalDeadlines';

interface Props {
  deadline: DetectedDeadline;
  receivedAtISO: string;   // data de disponibilização (YYYY-MM-DD)
  tribunal?: string | null; // sigla p/ feriados estaduais (opcional)
}

type SkipReason = 'sabado' | 'domingo' | 'feriado_cnj' | 'recesso' | 'feriado_local' | 'suspensao';
interface SkippedDay { iso: string; reason: SkipReason; label: string; }

function classifySkip(iso: string): { reason: SkipReason; label: string } {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 6) return { reason: 'sabado', label: 'Sábado' };
  if (dow === 0) return { reason: 'domingo', label: 'Domingo' };
  const [, mm, dd] = iso.split('-').map(Number);
  if ((mm === 12 && dd >= 20) || (mm === 1 && dd <= 20)) return { reason: 'recesso', label: 'Recesso forense (CPC art. 220)' };
  if (getCnjHolidays(d.getUTCFullYear()).has(iso)) return { reason: 'feriado_cnj', label: 'Feriado nacional (calendário CNJ)' };
  return { reason: 'feriado_local', label: 'Feriado local / suspensão' };
}

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

export function DeadlinePanel({ deadline, receivedAtISO, tribunal }: Props) {
  const [open, setOpen] = useState(false);
  const sev = SEV[deadline.severity];
  const unitLabel = deadline.unit === 'dias_uteis' ? 'dias úteis' : 'dias corridos';
  const publicacao = useMemo(() => nextBusinessDay(receivedAtISO), [receivedAtISO]);

  const skipped: SkippedDay[] = useMemo(() => {
    if (!deadline.startDate || !deadline.dueDate) return [];
    return eachDayISO(deadline.startDate, deadline.dueDate)
      .filter(iso => !isBusinessDay(iso, tribunal ? { tribunal } : undefined))
      .map(iso => ({ iso, ...classifySkip(iso) }));
  }, [deadline.startDate, deadline.dueDate, tribunal]);

  const hasLocalHoliday = skipped.some(s => s.reason === 'feriado_local' || s.reason === 'suspensao');
  const remaining = deadline.severity === 'expired'
    ? `Vencido há ${Math.abs(deadline.businessDaysLeft)} d.u.`
    : deadline.businessDaysLeft === 0 ? 'Vence hoje'
    : deadline.businessDaysLeft === 1 ? 'Vence amanhã'
    : `${deadline.businessDaysLeft} d.u. restantes`;

  if (deadline.triggerSource === 'pauta' || deadline.days === 0) return null;

  return (
    <div className="mt-3 rounded-lg border bg-card/50 overflow-hidden">
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
          <span className="text-muted-foreground">Peça:</span>
          <span className="font-medium">{deadline.label}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-xs">{deadline.days}{deadline.doubled ? ' (2x)' : ''} {deadline.unit === 'dias_uteis' ? 'd.u.' : 'd.c.'}</span>
        </div>

        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Memorial de cálculo
        </button>
      </div>

      {/* Chips legais */}
      <div className="px-3 pb-3 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-muted/60 text-[11px] font-mono">
          <ScrollText className="h-3 w-3" /> {deadline.source} {deadline.article}
        </span>
        {deadline.unit === 'dias_uteis' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-muted/60 text-[11px] font-mono">
            CPC art. 219 · dias úteis
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-muted/60 text-[11px] font-mono">
          Lei 11.419/2006 art. 4º §§3º–4º · DJe
        </span>
        {deadline.doubled && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-primary/10 text-primary border-primary/40 text-[11px] font-mono">
            Prazo em dobro · CPC art. 183/186/229
          </span>
        )}
        {hasLocalHoliday && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-warning/60 bg-warning/15 text-warning text-[11px] font-semibold">
            <AlertOctagon className="h-3 w-3" /> Contagem pendente de validação (feriado local)
          </span>
        )}
        {!hasLocalHoliday && deadline.severity !== 'expired' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
            <ShieldCheck className="h-3 w-3" /> Calendário oficial CNJ aplicado
          </span>
        )}
      </div>

      {/* Memorial expansível */}
      {open && (
        <div className="border-t bg-muted/30 px-3 py-3 space-y-3 text-xs">
          <div>
            <div className="font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Memorial de cálculo</div>
            <ol className="space-y-1 list-decimal list-inside">
              <li><strong>Disponibilização (DJe):</strong> {formatBR(receivedAtISO)}</li>
              <li><strong>Publicação:</strong> {formatBR(publicacao)} <span className="text-muted-foreground">(1º dia útil seguinte · Lei 11.419/2006 art. 4º §3º)</span></li>
              {deadline.startDate && (
                <li><strong>Início da contagem (dies a quo):</strong> {formatBR(deadline.startDate)} <span className="text-muted-foreground">(1º dia útil seguinte à publicação · CPC art. 224 §3º)</span></li>
              )}
              <li><strong>Prazo legal:</strong> {deadline.days} {unitLabel}{deadline.doubled ? ' (em dobro)' : ''} <span className="text-muted-foreground">— {deadline.baseLegal}</span></li>
              <li><span className="text-muted-foreground">Regra CPC art. 224: exclui o dia do começo, inclui o dia do vencimento. Vencimento em dia não útil prorroga para o próximo útil (art. 224 §1º).</span></li>
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
