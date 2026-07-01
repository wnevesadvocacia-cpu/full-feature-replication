// Fonte única de verdade sobre quais tarefas são "de usuário" (visíveis em
// Agenda e na aba Tarefas). Qualquer alteração aqui reflete nas duas telas,
// evitando divergências que poderiam fazer o usuário perder prazo.
export const SYSTEM_ASSIGNEES = new Set(['movimentacao', 'documento', 'agenda']);

export function isUserTask(task: { assignee?: string | null }): boolean {
  const a = task.assignee?.trim().toLowerCase();
  return !a || !SYSTEM_ASSIGNEES.has(a);
}
