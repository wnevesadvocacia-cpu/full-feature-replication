import { describe, it, expect } from 'vitest';
import { detectDeadline } from '../legalDeadlines';

const D = (t: string) => detectDeadline(t, '2026-08-03', '2026-08-03', { tribunal: 'TJSP' });

describe('motor — acurácia de controller sênior (novas coberturas)', () => {
  it('decisão monocrática de relator → Agravo Interno 15 d.u. (CPC 1.021)', () => {
    const d = D('TJSP. Decisão monocrática do Relator negou seguimento ao recurso. Intimação da decisão monocrática proferida pelo Desembargador Relator.');
    expect(d?.days).toBe(15);
    expect(d?.pecaSugerida.peca).toBe('Agravo Interno');
  });

  it('inadmissão de recurso especial → Agravo do art. 1.042 com alternativa de Agravo Interno', () => {
    const d = D('Decisão da Presidência que NEGOU SEGUIMENTO ao recurso especial por intempestividade. Inadmitido o recurso especial.');
    expect(d?.days).toBe(15);
    expect(d?.pecaSugerida.peca).toContain('Agravo em Recurso Especial');
    expect(d?.pecaSugerida.peca_alternativa?.peca).toBe('Agravo Interno');
  });

  it('sentença penal → Apelação Criminal 5 dias corridos (CPP 593/798)', () => {
    const d = D('Juízo Criminal. Sentença penal condenatória publicada. Intime-se a defesa.');
    expect(d?.days).toBe(5);
    expect(d?.unit).toBe('dias_corridos');
    expect(d?.pecaSugerida.peca).toBe('Apelação Criminal');
  });

  it('rejeição de denúncia → RESE 5 dias corridos, sem dobro para o MP no rito penal', () => {
    const d = D('Decisão que rejeitou a denúncia. Intime-se o Ministério Público.');
    expect(d?.days).toBe(5);
    expect(d?.unit).toBe('dias_corridos');
    expect(d?.doubled).toBe(false);
    expect(d?.pecaSugerida.peca).toBe('Recurso em Sentido Estrito');
  });

  it('sentença trabalhista → Recurso Ordinário 8 d.u. (CLT 895, I)', () => {
    const d = D('Vara do Trabalho. Sentença trabalhista publicada. Intime-se o reclamante.');
    expect(d?.days).toBe(8);
    expect(d?.pecaSugerida.peca).toBe('Recurso Ordinário Trabalhista');
  });

  it('embargos à execução trabalhista → 5 d.u. (CLT 884)', () => {
    const d = D('Justiça do Trabalho. Garantida a execução, intime-se o executado para opor embargos à execução.');
    expect(d?.days).toBe(5);
    expect(d?.pecaSugerida.fundamento_legal).toContain('884');
  });

  it('manifestação sobre laudo pericial → 15 d.u. (CPC 477 §1º)', () => {
    const d = D('Manifestem-se as partes sobre o laudo pericial apresentado.');
    expect(d?.days).toBe(15);
  });

  it('emenda à inicial → 15 d.u. (CPC 321)', () => {
    const d = D('Emende o autor a petição inicial, nos termos do art. 321 do CPC, sob pena de indeferimento.');
    expect(d?.days).toBe(15);
    expect(d?.pecaSugerida.peca).toContain('Emenda');
  });

  it('especificação de provas → 15 d.u.', () => {
    const d = D('Especifiquem as partes as provas que pretendem produzir.');
    expect(d?.days).toBe(15);
  });

  it('alegações finais por memoriais (cível) → 15 d.u. (CPC 364 §2º)', () => {
    const d = D('Apresentem as partes alegações finais por memoriais.');
    expect(d?.days).toBe(15);
  });

  it('preparo sob pena de deserção → 5 d.u. (CPC 1.007 §4º), sem dobro', () => {
    const d = D('Recolha o apelante o preparo recursal, sob pena de deserção.');
    expect(d?.days).toBe(5);
    expect(d?.doubled).toBe(false);
  });

  it('pagamento voluntário do art. 523 → 15 d.u. com alternativa de impugnação', () => {
    const d = D('Intime-se o executado para pagamento voluntário do débito, nos termos do art. 523 do CPC, sob pena de multa de 10%.');
    expect(d?.days).toBe(15);
    expect(d?.pecaSugerida.peca).toContain('Impugnação');
  });
});
