import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { SuggestionReview } from '@/lib/taskSuggestionReview';

export function TaskSuggestionReview({ review }: { review: SuggestionReview }) {
  const reasons = [...new Set(review.checks.filter(check => !check.passed).map(check => check.reason))];
  return <div className="my-2 flex items-start gap-1.5 text-xs leading-relaxed" data-suggestion-review={review.approved ? 'approved' : 'held'}>
    {review.approved
      ? <><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="text-muted-foreground">Tarefa sugerida conferida em 3 verificações · conferir antes de protocolar</span></>
      : <><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /><span><span className="font-medium text-warning">Tarefa não sugerida automaticamente:</span> <span className="text-foreground/80">{reasons.join(' ')}</span></span></>}
  </div>;
}
