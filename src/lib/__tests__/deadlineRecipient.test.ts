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
    ['Vista à apelada para responder.', 'Apelado(a)'],
    ['Vista ao embargante para manifestação.', 'Embargante'],
    ['Vista ao embargado para manifestação.', 'Embargado(a)'],
    ['Manifestem-se ambas as partes em 5 dias.', 'Ambas as partes'],
    ['VISTA à(s) parte(s) para apresentar(em) contraminuta(s).', 'Ambas as partes'],
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
  ])('não presume destinatário: %s', text => {
    expect(deadlineRecipient(text).status).not.toBe('express');
    expect(deadlineRecipient(text).party).toBeNull();
  });
  it.each([
    'Intime-se o autor em 5 dias. Intime-se o réu em 15 dias.',
    'Intime-se o autor para apresentar documentos. Intime-se o autor para recolher custas.',
    'Intime-se o autor e o réu para apresentar documentos.',
    'Intime-se o autor para que o réu apresente documentos.',
    'Intime-se o autor para apresentar documentos e intime-se o réu para pagar.',
    'Processo 5004488-27.2023.8.13.0079. Processo 1021189-58.2022.8.26.0224. Intime-se o autor em 5 dias.',
  ])('não seleciona arbitrariamente entre comandos/processos: %s', text => {
    expect(deadlineRecipient(text)).toEqual({ status: 'ambiguous', party: null, evidence: null });
  });
  it('ausência de conteúdo não confirma destinatário', () => {
    expect(deadlineRecipient(null)).toEqual({ status: 'unknown', party: null, evidence: null });
  });
});