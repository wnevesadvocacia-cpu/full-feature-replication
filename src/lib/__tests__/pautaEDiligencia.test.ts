import { detectDeadline } from '@/lib/legalDeadlines';
const header = (cnj: string) => `Intimacao Processo: ${cnj} Orgao: Unidade Data de disponibilizacao: 10/08/2026 Meio: D Advogado(s): WILLIAM ROBSON DAS NEVES OAB SP-290702 `;
const pauta = header('1001706-22.2021.8.26.0533') + `DESPACHO Apelacao Civel - Apelante: Rodrigo de Souza SESSAO DE JULGAMENTO NA MODALIDADE VIRTUAL - RESOLUCAO CNJ 591/24 Data da pauta: 20/08/2026 as 00:01 Numero da pauta: 48 Eventuais pedidos de DESTAQUE deverao ser feitos ate 48 (quarenta e oito) horas antes do inicio da sessao.`;
const exec = header('0023240-26.2007.8.26.0114') + `Cumprimento de sentenca - Vistos. Fundamento e decido. Proceda-se a ordem de bloqueio de ativos financeiros via SISBAJUD, ate o limite do debito, inclusive na modalidade reiterada pelo prazo de trinta dias, bem como as pesquisas via RENAJUD e INFOJUD. Com o resultado das diligencias, manifeste-se em termos de prosseguimento, no prazo de 15 (quinze) dias, indicando bens penhoraveis. Frustradas as pesquisas, suspendo o cumprimento de sentenca pelo prazo de 1 (um) ano, com arquivamento provisorio.`;
it('pauta usa data da sessao', () => {
  const d = detectDeadline(pauta, '2026-08-10', '2026-08-10', { tribunal: 'TJSP' })!;
  console.log('PAUTA', d.label, d.dueDate, d.pecaSugerida.peca);
  expect(d.triggerSource).toBe('pauta');
  expect(d.dueDate).toBe('2026-08-18');
});
it('ignora prazo de diligencia do juizo', () => {
  const d = detectDeadline(exec, '2026-08-10', '2026-08-10', { tribunal: 'TJSP' })!;
  console.log('EXEC', d.label, d.days, d.dueDate);
  expect(d.days).toBe(15);
});
