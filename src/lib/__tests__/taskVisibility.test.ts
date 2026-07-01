import { describe, it, expect } from 'vitest';
import { isUserTask, SYSTEM_ASSIGNEES } from '../taskVisibility';

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
});
