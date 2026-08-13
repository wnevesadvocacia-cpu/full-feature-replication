import { describe, it, expect } from 'vitest';
import { detectDeadline } from '../legalDeadlines';

// Bateria SOTA: publicações reais por rito. Cada caso fixa prazo, unidade e peça.
const REF = '2026-08-06'; // quinta-feira útil
const det = (t: string, ctx?: { tribunal?: string }) => detectDeadline(t, REF, REF, ctx)!;

describe('SOTA — cumprimento de sentença e execução', () => {
  it('intimação para pagamento voluntário: 15 d.u. (CPC 523)', () => {
    const d = det('Intime-se o executado para pagar o débito no prazo de 15 (quinze) dias, sob pena de multa de 10% e honorários de 10% (art. 523 do CPC).');
    expect(d.days).toBe(15);
    expect(d.unit).toBe('dias_uteis');
  });

  it('impugnação ao cumprimento de sentença após garantia: 15 d.u. (CPC 525)', () => {
    const d = det('Decorrido o prazo de pagamento voluntário, intime-se o executado para apresentar impugnação ao cumprimento de sentença.');
    expect(d.days).toBe(15);
    expect(d.pecaSugerida.peca).toMatch(/Impugna/);
  });

  it('embargos à execução de título extrajudicial: 15 d.u. (CPC 915)', () => {
    const d = det('Citado o executado, poderá opor embargos a execução no prazo legal.');
    expect(d.days).toBe(15);
  });
});

describe('SOTA — fase de conhecimento', () => {
  it('réplica: 15 d.u.', () => {
    const d = det('Apresentada a contestação, manifeste-se a parte autora em réplica.');
    expect(d.days).toBe(15);
    expect(d.pecaSugerida.peca).toMatch(/Réplica/);
  });

  it('manifestação sobre laudo pericial: 15 d.u.', () => {
    const d = det('Juntado o laudo, intimem-se as partes para manifestação sobre o laudo pericial.');
    expect(d.days).toBe(15);
  });

  it('emenda à inicial: 15 d.u. (CPC 321)', () => {
    const d = det('Emende-se a inicial, sob pena de indeferimento.');
    expect(d.days).toBe(15);
  });

  it('especificação de provas: 15 d.u.', () => {
    const d = det('Intimem-se as partes para especificar provas que pretendem produzir.');
    expect(d.days).toBe(15);
  });

  it('diligência com prazo literal curto sob pena de extinção: 5 d.u.', () => {
    const d = det('Dê-se andamento ao feito no prazo de 5 (cinco) dias, sob pena de extinção.');
    expect(d.days).toBe(5);
    expect(d.unit).toBe('dias_uteis');
  });
});

describe('SOTA — recursos cíveis', () => {
  it('sentença de mérito: apelação 15 d.u.', () => {
    const d = det('Ante o exposto, julgo procedente o pedido e condeno o réu. Publique-se. Intimem-se.');
    expect(d.days).toBe(15);
    expect(d.pecaSugerida.peca).toMatch(/Apelação/);
  });

  it('decisão que indefere tutela de urgência: agravo de instrumento 15 d.u.', () => {
    const d = det('Indefiro a tutela de urgência requerida. Cabível agravo de instrumento.');
    expect(d.days).toBe(15);
    expect(d.pecaSugerida.peca).toMatch(/Agravo de Instrumento/);
  });

  it('acórdão de tribunal: RE/REsp 15 d.u.', () => {
    const d = det('ACÓRDÃO. Negaram provimento à apelação. V. U. 5ª Câmara de Direito Privado.');
    expect(d.days).toBeLessThanOrEqual(15);
    expect(d.pecaSugerida.peca).not.toMatch(/^Apelação$/);
  });
});

describe('SOTA — juizados especiais', () => {
  it('sentença JEC: recurso inominado 10 d.u.', () => {
    const d = det('Juizado Especial Cível. Julgo procedente o pedido. Sentença publicada em audiência. Intimem-se.');
    expect(d.days).toBe(10);
    expect(d.source).toBe('JEC');
  });

  it('contrarrazões de recurso inominado sem prazo literal: 10 d.u. (Lei 9.099 art. 42 §2º)', () => {
    const d = det('Turma Recursal. Intime-se o recorrido para apresentar contrarrazões ao recurso inominado.');
    expect(d.days).toBe(10);
    expect(d.source).toBe('JEC');
  });
});

describe('SOTA — trabalhista', () => {
  it('agravo de petição: 8 d.u.', () => {
    const d = det('TRT. Execução trabalhista. Cabe agravo de petição da decisão que julgou os cálculos.');
    expect(d.days).toBe(8);
    expect(d.source).toBe('CLT');
  });

  it('recurso de revista: 8 d.u.', () => {
    const d = det('TRT. Admitido o recurso de revista, subam os autos ao TST.');
    expect(d.days).toBe(8);
  });

  it('contrarrazões no rito trabalhista: 8 d.u.', () => {
    const d = det('Justiça do Trabalho. Vara do Trabalho. Intime-se o reclamado para apresentar contrarrazões.');
    expect(d.days).toBe(8);
    expect(d.source).toBe('CLT');
  });
});

describe('SOTA — penal', () => {
  it('resposta à acusação: 10 dias corridos', () => {
    const d = det('Vara Criminal. Cite-se o réu para apresentar resposta à acusação.');
    expect(d.days).toBe(10);
    expect(d.unit).toBe('dias_corridos');
  });

  it('recurso em sentido estrito: 5 dias corridos', () => {
    const d = det('Ação penal. Cabe recurso em sentido estrito da decisão que rejeitou a denúncia.');
    expect(d.days).toBe(5);
    expect(d.unit).toBe('dias_corridos');
  });
});

describe('SOTA — prazos em dobro', () => {
  it('Defensoria Pública dobra (CPC 186)', () => {
    const d = det('Intime-se a Defensoria Pública do Estado, que atua pelo réu, para apresentar apelação.');
    expect(d.doubled).toBe(true);
    expect(d.days).toBe(30);
  });

  it('Ministério Público dobra (CPC 180)', () => {
    const d = det('Dê-se vista ao Ministério Público para apresentar contestação como substituto processual.');
    expect(d.doubled).toBe(true);
    expect(d.days).toBe(30);
  });

  it('prazo literal não é dobrado quando o texto já fixa o prazo da parte', () => {
    const d = det('Intime-se a Fazenda Pública para manifestar-se no prazo de 30 (trinta) dias.');
    expect(d.days).toBe(30);
  });
});

describe('SOTA — atos sem prazo', () => {
  it('designação de audiência de conciliação é ciência', () => {
    const d = det('Designo audiência de conciliação para o dia 10/11/2026, às 14h00. Intimem-se as partes para comparecimento.');
    expect(d.dueDate === null || d.days === 0).toBe(true);
  });

  it('homologação de acordo: apelação apenas se houver interesse recursal', () => {
    const d = det('Homologo o acordo celebrado entre as partes e julgo extinto o processo. Arquivem-se os autos.');
    expect(d.pecaSugerida.peca).toMatch(/Apelação/);
    expect(d.days).toBe(15);
  });

  it('expedição de alvará de levantamento não abre prazo', () => {
    const d = det('Expeça-se alvará de levantamento em favor do credor. Após, arquive-se.');
    expect(d.days).toBe(0);
  });
});
