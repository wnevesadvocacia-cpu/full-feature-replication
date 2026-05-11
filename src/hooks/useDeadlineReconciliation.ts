// PR2 — UNIFICAÇÃO EDGE↔FRONTEND.
// A edge function `sync-djen` agora é a fonte única de verdade: classifica
// via detectDeadline na ingestão, popula deadline (auto_alta) ou
// deadline_sugerido_inseguro (demais). Reconciliação frontend ficou no-op.
//
// Mantemos o arquivo + assinatura do hook para evitar quebra de imports e
// permitir rollback rápido (basta restaurar o conteúdo do git history).
//
// Histórico anterior: rodava detectDeadline no cliente e fazia UPDATE para
// reconciliar com o que a edge tinha gravado via regex inferior. Esse
// caminho era a raiz do bug Caso 7 (override silencioso).

interface IntimForReconcile {
  id: string;
  user_id?: string;
  content: string;
  received_at: string;
  deadline: string | null;
  court?: string | null;
  classificacao_status?: string | null;
}

export function useDeadlineReconciliation(_items: IntimForReconcile[] | undefined): void {
  // no-op (PR2). Edge function `sync-djen` já grava classificação canônica.
  return;
}
