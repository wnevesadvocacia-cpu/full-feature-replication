import { describe, expect, it } from 'vitest';
import { detectDeadline } from '@/lib/legalDeadlines';
import { detectDeadline as detectDeadlineEdge } from '../../../supabase/functions/_shared/legalDeadlines.ts';

const header = (cnj: string) => `Intimacao Processo: ${cnj} Orgao: Unidade Data de disponibilizacao: 10/08/2026 Meio: D Advogado(s): WILLIAM ROBSON DAS NEVES OAB SP-290702 `;
const pauta = header('1001706-22.2021.8.26.0533') + `DESPACHO Apelacao Civel - Apelante: Rodrigo de Souza SESSAO DE JULGAMENTO NA MODALIDADE VIRTUAL - RESOLUCAO CNJ 591/24 Data da pauta: 20/08/2026 as 00:01 Numero da pauta: 48 Eventuais pedidos de DESTAQUE deverao ser feitos ate 48 (quarenta e oito) horas antes do inicio da sessao.`;
const exec = header('0023240-26.2007.8.26.0114') + `Cumprimento de sentenca - Vistos. Fundamento e decido. Proceda-se a ordem de bloqueio de ativos financeiros via SISBAJUD, ate o limite do debito, inclusive na modalidade reiterada pelo prazo de trinta dias, bem como as pesquisas via RENAJUD e INFOJUD. Com o resultado das diligencias, manifeste-se em termos de prosseguimento, no prazo de 15 (quinze) dias, indicando bens penhoraveis. Frustradas as pesquisas, suspendo o cumprimento de sentenca pelo prazo de 1 (um) ano, com arquivamento provisorio.`;

const cases = [
  { name: 'pauta usa data da sessão, não a disponibilização', text: pauta },
  { name: 'ignora SISBAJUD e suspensão e usa comando dirigido à parte', text: exec },
];

describe('regressões permanentes — pauta e diligências do juízo', () => {
  it(cases[0].name, () => {
    const d = detectDeadline(cases[0].text, '2026-08-10', '2026-08-10', { tribunal: 'TJSP' });
    expect(d?.triggerSource).toBe('pauta');
    expect(d?.dueDate).toBe('2026-08-18');
  });

  it(cases[1].name, () => {
    const d = detectDeadline(cases[1].text, '2026-08-10', '2026-08-10', { tribunal: 'TJSP' });
    expect(d?.days).toBe(15);
    expect(d?.matchedText).toMatch(/manifeste-se/);
  });

  for (const testCase of cases) {
    it(`mantém frontend e backend idênticos: ${testCase.name}`, () => {
      const args = [testCase.text, '2026-08-10', '2026-08-10', { tribunal: 'TJSP' }] as const;
      expect(detectDeadlineEdge(...args)).toEqual(detectDeadline(...args));
    });
  }
});
