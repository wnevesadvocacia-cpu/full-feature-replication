// Fonte única de verdade sobre quais tarefas são "de usuário" (visíveis em
// Agenda e na aba Tarefas). Qualquer alteração aqui reflete nas duas telas,
// evitando divergências que poderiam fazer o usuário perder prazo.
export const SYSTEM_ASSIGNEES = new Set(['movimentacao', 'documento', 'agenda']);

function norm(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isUserTask(task: { assignee?: string | null; title?: string | null; description?: string | null }): boolean {
  const title = norm(task.title);
  const description = norm(task.description);
  if (title.includes('tarefa excluida') || description.includes('excluiu a tarefa')) return false;

  const a = task.assignee?.trim().toLowerCase();
  return !a || !SYSTEM_ASSIGNEES.has(a);
}
