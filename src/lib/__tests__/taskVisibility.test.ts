import { describe, it, expect } from 'vitest';
import { isUserTask, isOverdueTask, SYSTEM_ASSIGNEES } from '../taskVisibility';

describe('quadro de prazos vencidos', () => {
  const today = '2026-10-15';
  it('inclui prazo pendente vencido em 14/10/2026', () => {
    expect(isOverdueTask({ due_date: '2026-10-14', completed: false, status: 'em_elaboracao' }, today)).toBe(true);
  });
  it('não considera vencido um prazo que vence hoje ou depois', () => {
    expect(isOverdueTask({ due_date: today }, today)).toBe(false);
    expect(isOverdueTask({ due_date: '2026-10-16' }, today)).toBe(false);
  });
  it('exclui prazos concluídos', () => {
    expect(isOverdueTask({ due_date: '2026-10-14', completed: true }, today)).toBe(false);
  });
  it('exclui prazos cancelados', () => {
    expect(isOverdueTask({ due_date: '2026-10-14', status: 'cancelada', completed: false }, today)).toBe(false);
  });
  it('exclui prazos sem data', () => {
    expect(isOverdueTask({ due_date: null }, today)).toBe(false);
  });
});

// Regra crítica: Agenda e aba Tarefas DEVEM mostrar exatamente o mesmo
// conjunto de tarefas de usuário. Divergência = risco de perda de prazo.
describe('taskVisibility — paridade Agenda ↔ Tarefas', () => {
  it('inclui tarefas com assignee NULL (criadas sem responsável)', () => {
    expect(isUserTask({ assignee: null })).toBe(true);
    expect(isUserTask({ assignee: undefined })).toBe(true);
    expect(isUserTask({})).toBe(true);
  });

  it('inclui tarefas com e-mail de usuário', () => {
    expect(isUserTask({ assignee: 'wneves2006@yahoo.com.br' })).toBe(true);
  });

  it('exclui apenas os assignees de sistema (case/espaço-insensitive)', () => {
    for (const sys of SYSTEM_ASSIGNEES) {
      expect(isUserTask({ assignee: sys })).toBe(false);
      expect(isUserTask({ assignee: sys.toUpperCase() })).toBe(false);
      expect(isUserTask({ assignee: `  ${sys}  ` })).toBe(false);
    }
  });

  it('inclui string vazia (tratada como sem responsável)', () => {
    expect(isUserTask({ assignee: '' })).toBe(true);
    expect(isUserTask({ assignee: '   ' })).toBe(true);
  });

  it('exclui alertas importados de tarefa excluída', () => {
    expect(isUserTask({ title: 'ALERTA DE TAREFA EXCLUÍDA', assignee: null })).toBe(false);
    expect(isUserTask({ description: 'Ivan Cardoso excluiu a tarefa https://app.advbox.com.br/0?t:65401287' })).toBe(false);
  });
});
