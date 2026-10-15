import { useMemo, useState } from 'react';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deadlineRecipient } from '@/lib/deadlineRecipient';

export function DeadlineRecipient({ content }: { content?: string | null }) {
  const result = useMemo(() => deadlineRecipient(content), [content]);
  const [open, setOpen] = useState(false);
  return (
    <div className="my-2 text-xs leading-relaxed" data-deadline-recipient={result.status}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">Destinatário do prazo:</span>
        {result.status === 'express' ? <>
          <strong className="font-semibold text-foreground">{result.party}</strong>
          <span className="text-muted-foreground">· indicado no ato</span>
          <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Trecho do ato
          </Button>
        </> : <span className="font-medium text-warning">Não confirmado — conferir inteiro teor{result.status === 'ambiguous' ? ' (comandos ou destinatários distintos)' : ''}.</span>}
      </div>
      {open && result.evidence && <blockquote className="mt-2 border-l-2 border-border pl-3 text-muted-foreground break-words whitespace-pre-wrap">{result.evidence}</blockquote>}
    </div>
  );
}
