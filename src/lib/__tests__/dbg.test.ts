import { it } from 'vitest';
import { detectDeadline } from '@/lib/legalDeadlines';
it('dbg', () => {
  const r = detectDeadline('Cite-se a Fazenda Pública para apresentar contestação no prazo de 15 dias.', '2026-03-02', '2026-03-02');
  console.log(JSON.stringify({t:r?.triggerSource,d:r?.doubled,days:r?.days,label:r?.label,dr:r?.doubleReasons}));
});
