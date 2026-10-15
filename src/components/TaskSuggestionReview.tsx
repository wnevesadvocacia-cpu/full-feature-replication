import { useState } from 'react';
import { ShieldAlert, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SuggestionReview } from '@/lib/taskSuggestionReview';

export function TaskSuggestionReview({ review }: { review: SuggestionReview }) {
  const [open, setOpen] = useState(false);
  const passed = review.checks.filter(check => check.passed).length;
  return <div className="my-2 text-xs leading-relaxed" data-suggestion-review={review.approved ? 'approved' : 'held'}>
    <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(value => !value)} aria-expanded={open} className={`h-auto min-h-7 max-w-full justify-start gap-1.5 px-0 text-left whitespace-normal ${review.approved ? 'text-muted-foreground' : 'text-warning'}`}>
      {review.approved ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> : <ShieldAlert className="h-3.5 w-3.5 shrink-0" />}
      <span>Revisão tripla · {passed}/3 verificações compatíveis{review.approved ? ' · conferir antes de protocolar' : ' · sugestão retida para conferência'}</span>
      {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
    </Button>
    {open && <ol className="mt-1 space-y-1 border-l-2 border-border pl-3 text-muted-foreground">
      {review.checks.map((check, index) => <li key={check.stage}>{index + 1}. {check.reason}</li>)}
    </ol>}
  </div>;
}