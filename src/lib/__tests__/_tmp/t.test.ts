import { describe, it, expect } from 'vitest';
import { detectDeadline } from '../legalDeadlines';

describe('repro', () => {
  it('lista longa com boilerplate prazo', () => {
    const text = `PROCESSOS DISTRIBUÍDOS EM 10/08/2026.
1002233-45.2026.8.26.0100 - Apelação Cível - Processo Digital - Relator: Fulano - Apelante: Jose - Apelado: Estado de São Paulo.
1002234-11.2026.8.26.0100 - Apelação Cível - Processo Digital - Apelante: Maria - Apelado: Municipio de Sao Paulo.
Nada mais havendo, encerra-se a presente distribuição. Fica registrado que, nos termos do art. 231 do CPC, o prazo para eventual manifestação corre da publicação.`;
    const det = detectDeadline(text, '2026-08-11', '2026-08-11', { tribunal: 'TJSP' });
    console.log(JSON.stringify(det, null, 2));
  });
});
