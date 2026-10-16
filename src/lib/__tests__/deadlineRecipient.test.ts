import { describe, expect, it } from 'vitest';
import { deadlineRecipient } from '@/lib/deadlineRecipient';

describe('destinatário expresso do comando atual', () => {
  it.each([
    ['Intime-se o autor para apresentar documentos em 5 dias.', 'Parte autora'],
    ['Manifeste-se a parte autora em 5 dias.', 'Parte autora'],
    ['Cite-se o réu para contestar em 15 dias.', 'Parte ré'],
    ['Vista à parte ré para manifestação.', 'Parte ré'],
    ['Intime-se o exequente para recolher as custas em 5 dias.', 'Exequente'],
    ['Intime-se a executada para pagar em 15 dias.', 'Executado(a)'],
    ['Vista ao recorrente para manifestação.', 'Recorrente'],
    ['Intime-se a recorrida para oferecer contrarrazões.', 'Recorrido(a)'],
    ['Vista ao agravado para apresentar contraminuta.', 'Agravado(a)'],
    ['Intime-se o agravante para regularizar a representação.', 'Agravante'],
    ['Intime-se o apelante para recolher o preparo.', 'Apelante'],
    ['Vista à apelada para apresentar resposta.', 'Apelado(a)'],
    ['Vista ao embargante para manifestação.', 'Embargante'],
    ['Vista ao embargado para manifestação.', 'Embargado(a)'],
    ['Manifestem-se ambas as partes em 5 dias.', 'Ambas as partes'],
    ['Vista às partes para apresentar contraminutas.', 'Ambas as partes'],
    ['A autora deverá apresentar documentos em 5 dias.', 'Parte autora'],
    ['<p>Intime-se <strong>o réu</strong> para contestar em 15 dias.</p>', 'Parte ré'],
  ])('resolve apenas o sujeito expresso: %s', (text, party) => {
    expect(deadlineRecipient(text).party).toBe(party);
  });
  it('preserva evidência literal com acentos', () => {
    expect(deadlineRecipient('Vistos. Intime-se o réu para contestar em 15 dias.')).toEqual({ status: 'express', party: 'Parte ré', evidence: 'Intime-se o réu para contestar em 15 dias' });
  });
  it.each([
    'AUTOR: Maria. RÉU: João. ADVOGADO: William OAB/SP 290702. Apresentar contraminuta em 15 dias.',
    'Apelação Cível. Apelante: Maria. Apelado: João. Intime-se.',
    'Responsável: Paula. Prazo de 15 dias para contrarrazões.',
    'Intime-se para apresentar documentos.',
    'Despacho anterior: Intime-se o réu para contestar em 15 dias.',
    'Transcrevo: Intime-se o réu para contestar em 15 dias.',
    '“Intime-se o réu para contestar em 15 dias.”',
    'Não intime-se o autor para apresentar documentos.',
    'Caso necessário, intime-se o autor para apresentar documentos.',
    'Revogo a ordem. Intime-se o autor para apresentar documentos.',
    'O réu foi intimado para contestar em 15 dias.',
    'Intime-se Maria para apresentar documentos em 5 dias.',
    'Intime-se o autor para apresentar documentos. Apresente contraminuta em 15 dias.',
    'Intime-se o autor da expedição de mandado.',
    'Intime-se o autor (vide despacho retro).',
    'VISTA à(s) parte(s) para apresentar(em) contraminuta(s).',
  ])('não presume destinatário: %s', text => {
    expect(deadlineRecipient(text).status).not.toBe('express');
    expect(deadlineRecipient(text).party).toBeNull();
  });
  it.each([
    'Intime-se o autor em 5 dias. Intime-se o réu em 15 dias.',
    'Intime-se o autor para apresentar documentos. Intime-se o autor para recolher custas.',
    'Intime-se o autor e o réu para apresentar documentos.',
    'Intime-se o autor para que o réu apresente documentos.',
    'Intime-se o autor para que o perito apresente o laudo.',
    'Intime-se o autor para que a União se manifeste.',
    'Intime-se o autor para apresentar documentos e intime-se o réu para pagar.',
    'Processo 5004488-27.2023.8.13.0079. Processo 1021189-58.2022.8.26.0224. Intime-se o autor em 5 dias.',
  ])('não seleciona arbitrariamente entre comandos/processos: %s', text => {
    expect(deadlineRecipient(text)).toEqual({ status: 'ambiguous', party: null, evidence: null });
  });
  it('ausência de conteúdo não confirma destinatário', () => {
    expect(deadlineRecipient(null)).toEqual({ status: 'unknown', party: null, evidence: null });
  });
});
import { recipientDiagnosis } from '../deadlineRecipient';
describe('recipientDiagnosis', () => {
  it('names the generic party and shows the command excerpt', () => {
    expect(recipientDiagnosis('VISTA à(s) parte(s) para apresentar(em) contraminuta(s).')).toEqual({
      reason: 'o ato diz “parte(s)” sem indicar qual',
      excerpts: ['VISTA à(s) parte(s) para apresentar(em) contraminuta(s)'],
    });
  });
});

describe('ato real de cumprimento de sentença', () => {
  const ato = 'Intimação Processo: 0001954-23.2023.8.26.0084 Parte(s): FLEX ANALISE DE CREDITO E COBRANCA LTDA.; MAYARA VALERIO FERREIRA CUMPRIMENTO DE SENTENÇA Nº 0001954-23.2023.8.26.0084/SP EXEQUENTE: MAYARA VALERIO FERREIRA ADVOGADO(A): WILLIAM ROBSON DAS NEVES (OAB SP290702)EXECUTADO: FLEX ANALISE DE CREDITO E COBRANCA LTDA.ADVOGADO(A): MARCIO SANTANA BATISTA (OAB SP257034) DESPACHO/DECISÃO Vistos. Consultados os autos da apelação nº 1003687-56.2023.8.26.0100, verifica-se que o recurso foi extinto, como já decidido no evento 33. Ante o exposto, intime-se a parte executada, na pessoa de seu advogado constitu&iacute;do nos autos, para que, no prazo de 15 (quinze) dias, efetue o pagamento do montante executado (R$ 23.254,42, atualizado até 09/12/2025), sob pena de multa de 10% (dez por cento), nos termos do art. 523, § 1º, do Código de Processo Civil. Intimem-se. Campinas, 13 de outubro de 2026.';
  it('identifica a parte executada apesar de apelação citada e valores', () => {
    expect(deadlineRecipient(ato)).toMatchObject({ status: 'express', party: 'Executado(a)' });
  });
});

import { recipientPartyName } from '../deadlineRecipient';
describe('recipientPartyName', () => {
  it('lê o nome do executado no cabeçalho', () => {
    expect(recipientPartyName('EXEQUENTE: MAYARA VALERIO FERREIRA ADVOGADO(A): WILLIAM (OAB SP290702)EXECUTADO: FLEX ANALISE DE CREDITO E COBRANCA LTDA.ADVOGADO(A): MARCIO', 'Executado(a)')).toBe('FLEX ANALISE DE CREDITO E COBRANCA LTDA');
  });
});

import { recipientDirectives } from '../deadlineRecipient';
describe('recipientDirectives', () => {
  it('lista cada parte nomeada com sua providência e prazo', () => {
    const ato = 'Parte(s): ATACADãO S.A.; BANCO CSF S/A; MARCIA MARIA PEREIRA UZAM\nAdvogado(s): X\nProcesso 1013449-82.2022.8.26.0019 - Procedimento Comum Cível - Indenização por Dano Moral - Marcia Maria Pereira Uzam - Atacadão S.A. - - Banco CSF S/A - Vistos. O Banco CSF S.A. deverá, no prazo de 15 dias, apresentar: a. o contrato. O Atacadão S.A., no mesmo prazo, deverá esclarecer se participou da oferta. Servirá esta DECISÃO COMO OFÍCIO, ficando o patrono do requerente autorizado a imprimir e entregar à destinatária, mediante protocolo que deverá ser comprovado nos autos em cinco dias. Intime(m)-se.';
    expect(recipientDirectives(ato).map(d => [d.party, d.term])).toEqual([['Parte ré — BANCO CSF S/A', '15 dias'], ['Parte ré — ATACADÃO S.A.', 'mesmo prazo'], ['Parte autora', 'cinco dias']]);
    expect(recipientDirectives(ato)[0].task).toBe('apresentar: a. o contrato');
  });
});

describe('parte recorrida intimada', () => {
  it('identifica a parte recorrida para contrarrazões', () => {
    const ato = 'Parte(s): A BRASILEIRA LOJA LTDA; DENIS THIAGO\nVISTA\nNº 1029951-64.2024.8.26.0007 - Processo Digital. Petições devem ser apresentadas por meio eletrônico, nos termos do artigo 7º da Res. 551/2011 - Apelação Cível - São Paulo - Apelante: Denis (Justiça Gratuita) - Apelado: A Brasileira Loja Ltda - Fica(m) intimada(s) a(s) parte(s) recorrida(s) para que apresente(m) contrarrazões ao(s) recurso(s).  - Advs: William';
    expect(deadlineRecipient(ato)).toMatchObject({ status: 'express', party: 'Recorrido(a)' });
  });
});

describe('comando precedido de referência a folhas', () => {
  it('identifica a exequente em "Fls. 57/61 (...): Manifeste-se a exequente, em 15 dias"', () => {
    const ato = 'Intimação Processo: 0007842-62.2025.8.26.0161 Órgão: Foro de Diadema - 2ª Vara Cível Parte(s): DENER PEREIRA DE LIMA; MARIA DE FÁTIMA DA SILVA Processo 0007842-62.2025.8.26.0161 (processo principal 1007386-66.2023.8.26.0161) - Cumprimento de sentença - Práticas Abusivas - Maria de Fátima da Silva - Dener Pereira de Lima - Fls. 57/61 (depósito e pedido de extinção): Manifeste-se a exequente, em 15 dias. Int. - ADV: JESSICA CRISTINA RIBEIRO TODA RANGEL (OAB 493450/SP)';
    expect(deadlineRecipient(ato)).toMatchObject({ status: 'express', party: 'Exequente' });
  });
});
