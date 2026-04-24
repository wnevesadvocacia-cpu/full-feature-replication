import { AlertTriangle, AlarmClock, CalendarClock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatBR } from '@/lib/cnjCalendar';
import type { DetectedDeadline } from '@/lib/legalDeadlines';

interface Props {
  deadline: DetectedDeadline;
  receivedAtISO: string;
}

const SEVERITY_STYLES: Record<DetectedDeadline['severity'], { bg: string; icon: JSX.Element; label: string }> = {
  expired: {
    bg: 'bg-destructive text-destructive-foreground border-destructive',
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    label: 'VENCIDO',
  },
  critical: {
    bg: 'bg-destructive/15 text-destructive border-destructive/40',
    icon: <AlarmClock className="h-3.5 w-3.5" />,
    label: 'URGENTE',
  },
  warning: {
    bg: 'bg-warning/15 text-warning border-warning/40',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    label: 'ATENÇÃO',
  },
  normal: {
    bg: 'bg-primary/10 text-primary border-primary/30',
    icon: <CalendarClock className="h-3.5 w-3.5" />,
    label: 'PRAZO',
  },
};

export function DeadlineBadge({ deadline, receivedAtISO }: Props) {
  const style = SEVERITY_STYLES[deadline.severity];
  const unitLabel = deadline.unit === 'dias_uteis' ? 'dias úteis' : 'dias corridos';

  const remainingText = deadline.severity === 'expired'
    ? `Vencido há ${Math.abs(deadline.businessDaysLeft)} dia(s) útil(eis)`
    : deadline.businessDaysLeft === 0
      ? 'Vence hoje'
      : `${deadline.businessDaysLeft} dia(s) útil(eis) restante(s)`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide ${style.bg} cursor-help select-none`}
            aria-label={`Prazo legal: ${deadline.label}, ${remainingText}`}
          >
            {style.icon}
            <span>{deadline.label}{deadline.isFallback ? ' *' : ''}</span>
            <span className="opacity-70">·</span>
            <span>{deadline.days}{deadline.doubled ? ' (2x)' : ''} {deadline.unit === 'dias_uteis' ? 'd.u.' : 'd.c.'}</span>
            {deadline.startDate && deadline.dueDate && (
              <>
                <span className="opacity-70">·</span>
                <span>{formatBR(deadline.startDate)} → {formatBR(deadline.dueDate)}</span>
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              {deadline.label} — {deadline.source} {deadline.article}
            </div>
            <div><strong>Disponibilizado:</strong> {formatBR(receivedAtISO.slice(0, 10))}</div>
            {deadline.startDate && (
              <div><strong>Início da contagem:</strong> {formatBR(deadline.startDate)} (1º dia útil após a publicação — CPC art. 224 §3º)</div>
            )}
            <div><strong>Contagem:</strong> {deadline.days} {unitLabel}{deadline.doubled ? ' (em dobro – Fazenda/MP/Defensoria, art. 183/186 CPC)' : ''}</div>
            {deadline.dueDate && (
              <div><strong>Vencimento:</strong> {formatBR(deadline.dueDate)} ({remainingText})</div>
            )}
            {deadline.isFallback && (
              <div className="text-warning"><strong>* Regra geral aplicada:</strong> o despacho não fixou prazo expresso, então adotou-se 5 dias úteis (CPC art. 218 §3º).</div>
            )}
            <div className="pt-1 border-t border-border/50 text-[10px] opacity-80">
              Cálculo conforme calendário CNJ (feriados nacionais + recesso 20/12–20/01) e CPC art. 219/224.
              Confirme sempre com o diploma processual aplicável e peculiaridades do caso (litisconsórcio, suspensões, etc).
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
