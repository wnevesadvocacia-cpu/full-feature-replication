import { useMemo, useState } from 'react';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deadlineRecipient, recipientDiagnosis, recipientPartyName } from '@/lib/deadlineRecipient';

export function DeadlineRecipient({ content }: { content?: string | null }) {
  const result = useMemo(() => deadlineRecipient(content), [content]);
  const diagnosis = useMemo(() => result.status === 'express' ? null : recipientDiagnosis(content), [result.status, content]);
  const name = useMemo(() => recipientPartyName(content, result.party), [content, result.party]);
  const [open, setOpen] = useState(false);
  return (
    <div className="my-2 text-xs leading-relaxed" data-deadline-recipient={result.status}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">Destinatário do prazo:</span>
        {result.status === 'express' ? <>
          <strong className="font-semibold text-foreground">{result.party}{name ? ` — ${name}` : ''}</strong>
          <span className="text-muted-foreground">· indicado no ato</span>
          <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Trecho do ato
          </Button>
        </> : <span className="font-medium text-warning">não definido — {diagnosis?.reason}</span>}
      </div>
      {open && result.evidence && <blockquote className="mt-2 border-l-2 border-border pl-3 text-muted-foreground break-words whitespace-pre-wrap">{result.evidence}</blockquote>}
      {diagnosis && diagnosis.excerpts.length > 0 && <blockquote className="mt-1.5 space-y-0.5 border-l-2 border-warning/40 pl-3 text-foreground/80 break-words">
        {diagnosis.excerpts.map((excerpt, index) => <p key={index}>“{excerpt}”</p>)}
      </blockquote>}
    </div>
  );
}
