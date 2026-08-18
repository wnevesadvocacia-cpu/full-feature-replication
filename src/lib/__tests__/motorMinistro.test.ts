import { describe, it, expect } from 'vitest';
import { detectDeadline } from '../legalDeadlines';
import { instanciaFromContext, sistemaFromContent, tribunalFromCNJ } from '@/lib/cnjTribunal';

// Bateria "nível ministro": exigência de precisão absoluta em prazo, peça, dobro,
// unidade de contagem e grau de jurisdição, com linguagem real de publicações.
const REF = '2026-08-06'; // quinta-feira útil
const d = (t: string, ctx?: Parameters<typeof detectDeadline>[3]) => detectDeadline(t, REF, REF, ctx)!;

describe('ministro — prazos recursais por rito', () => {
  it('apelação cível 15 d.u. contra sentença de mérito', () => {
    const r = d('Ante o exposto, JULGO PROCEDENTE o pedido. Sentença registrada. 3ª Vara Cível.');
    expect(r.days).toBe(15);
    expect(r.pecaSugerida.peca).toMatch(/Apela/);
  });

  it('embargos de declaração em 1º grau 5 d.u.', () => {
    const r = d('Oponho embargos de declaração contra a sentença. 2ª Vara Cível.');
    expect(r.days).toBe(5);
  });

  it('recurso inominado no JEC 10 d.u.', () => {
    const r = d('Juizado Especial Cível. Sentença. Cabe recurso inominado.');
    expect(r.days).toBe(10);
    expect(r.source).toBe('JEC');
  });

  it('recurso ordinário trabalhista 8 dias (CLT)', () => {
    const r = d('Vara do Trabalho. TRT. Sentença. Interponha-se recurso ordinário.');
    expect(r.days).toBe(8);
    expect(r.source).toBe('CLT');
  });

  it('apelação criminal 5 dias (CPP)', () => {
    const r = d('Vara Criminal. Sentença condenatória. Apelação, art. 593 do CPP.');
    expect(r.days).toBe(5);
    expect(r.source).toBe('CPP');
  });
});

describe('ministro — dobro (CPC 183/186/229)', () => {
  it('Fazenda Pública intimada dobra', () => {
    const r = d('Intime-se a Fazenda Pública do Estado para apresentar contestação.');
    expect(r.doubled).toBe(true);
    expect(r.days).toBe(30);
  });

  it('Defensoria Pública dobra (art. 186)', () => {
    const r = d('Intime-se a Defensoria Pública para apresentar contestação.');
    expect(r.doubled).toBe(true);
    expect(r.days).toBe(30);
  });

  it('ente público como mero polo adverso não dobra', () => {
    const r = d('Apelado: Estado de São Paulo. Intime-se o autor, particular, para apresentar contrarrazões.');
    expect(r.doubled).toBe(false);
    expect(r.days).toBe(15);
  });

  it('prazo literal do juízo não é dobrado para ente público', () => {
    const r = d('Intime-se a Fazenda Pública para, no prazo de 10 (dez) dias, manifestar-se sobre os cálculos.');
    expect(r.days).toBe(10);
    expect(r.doubled).toBe(false);
  });
});

describe('ministro — atos sem prazo (falso positivo é erro grave)', () => {
  it('trânsito em julgado / arquivamento', () => {
    const r = d('Certifico o trânsito em julgado. Arquivem-se os autos.');
    expect(r.days).toBe(0);
    expect(r.dueDate).toBeNull();
  });

  it('migração de sistema é mera ciência', () => {
    const r = d('Ficam as partes cientificadas de que o processo passará a tramitar no Sistema Eproc. Providenciem credenciamento.');
    expect(r.days).toBe(0);
  });

  it('entrada de autos no tribunal é ciência', () => {
    const r = d('Entrada de Autos. PROCESSO ENTRADO EM 03/08/2026. Apelação Cível; Apelante: José; Apelado: Estado de São Paulo.');
    expect(r.days).toBe(0);
  });

  it('lista de processos distribuídos é ciência', () => {
    const r = d('PROCESSOS DISTRIBUÍDOS EM 10/08/2026. Apelação Cível; 7ª Câmara de Direito Público.');
    expect(r.days).toBe(0);
  });

  it('diligência expressa dentro de ato informativo mantém prazo', () => {
    const r = d('Em razão da migração ao EPROC, solicita-se cadastro. Recolha o interessado a taxa em 15 (quinze) dias.');
    expect(r.days).toBe(15);
  });
});

describe('ministro — guarda recursiva (nunca sugerir o recurso negado)', () => {
  it('negativa de seguimento a RE por tema vinculante → agravo interno 15 d.u.', () => {
    const r = d('Recurso Inominado. Observado o tema 956 do STF, NEGO SEGUIMENTO ao recurso extraordinário, art. 1.030, I, a, do CPC.');
    expect(r.days).toBe(15);
    expect(r.pecaSugerida.peca).toBe('Agravo Interno');
  });

  it('colegiado que nega provimento a agravo interno → EDcl 5 d.u.', () => {
    const r = d('EXTRATO DE ATA DA SESSÃO VIRTUAL. A 3ª TURMA RECURSAL CÍVEL DECIDIU, POR UNANIMIDADE, NEGAR PROVIMENTO AO AGRAVO INTERNO.');
    expect(r.days).toBe(5);
    expect(r.pecaSugerida.peca).toBe('Embargos de Declaração');
  });

  it('acórdão que rejeita EDcl → recurso excepcional 15 d.u.', () => {
    const r = d('ACÓRDÃO. Rejeitaram os embargos de declaração. V. U. 10ª Câmara de Direito Público.');
    expect(r.days).toBe(15);
    expect(r.pecaSugerida.peca).toMatch(/Especial|Extraordin/);
  });
});

describe('ministro — unidade de contagem e prorrogação', () => {
  it('dias corridos literais são respeitados', () => {
    const r = d('Comprove o recolhimento em até 30 dias corridos.');
    expect(r.unit).toBe('dias_corridos');
    expect(r.days).toBe(30);
  });

  it('horas convertem para dias corridos', () => {
    const r = d('Recolha o preparo em 48 horas, sob pena de deserção. Juizado Especial.');
    expect(r.unit).toBe('dias_corridos');
    expect(r.days).toBe(2);
  });

  it('recesso forense (20/12–20/01) é integralmente pulado', () => {
    const r = detectDeadline('Manifeste-se no prazo de 5 dias.', '2025-12-18', '2025-12-18')!;
    expect(r.startDate).toBe('2026-01-21');
    expect(r.dueDate).toBe('2026-01-27');
  });

  it('fallback da regra geral: 5 d.u. (art. 218 §3º)', () => {
    const r = d('Cumpra-se. Intime-se a parte autora.');
    expect(r.isFallback).toBe(true);
    expect(r.days).toBe(5);
  });
});

describe('ministro — tribunal, sistema e grau de jurisdição', () => {
  it('CNJ do TJPR não é confundido com TJPE', () => {
    expect(tribunalFromCNJ('0001379-31.2025.8.16.0146')?.sigla).toBe('TJPR');
  });

  it('sistema declarado no teor prevalece sobre o padrão do tribunal', () => {
    expect(sistemaFromContent('O processo passará a tramitar no Sistema Eproc.')).toBe('eproc');
    expect(sistemaFromContent('Autos em trâmite no PJe. Assinado eletronicamente.')).toBe('PJe');
  });

  it('grau: turma recursal, 2º grau e 1º grau', () => {
    expect(instanciaFromContext('1020093-79.2024.8.26.0016', '3ª TURMA RECURSAL CÍVEL.')).toBe('Turma Recursal');
    expect(instanciaFromContext('1001630-35.2017.8.26.0372', 'Vice-Presidência. Juízo de admissibilidade.')).toBe('2º Grau');
    expect(instanciaFromContext('0000389-65.2022.8.26.0114', '2ª Vara Cível do Foro de São Paulo.')).toBe('1º Grau');
  });

  it('grau: tribunal superior pelo próprio CNJ', () => {
    expect(instanciaFromContext('1000000-00.2026.3.00.0000', 'Intime-se.')).toBe('Instância Superior');
  });

  it('grau sempre resolvido para CNJ válido, mesmo sem pistas textuais', () => {
    expect(instanciaFromContext('1001630-35.2017.8.26.0372', 'Intime-se.')).toBe('1º Grau');
    expect(instanciaFromContext('2100000-00.2026.8.26.0000', 'Intime-se.')).toBe('2º Grau');
  });
});

describe('ministro — integridade do retorno', () => {
  it('toda detecção com prazo traz peça, base legal, confiança, início e vencimento úteis', () => {
    const r = d('Cite-se o réu para apresentar contestação.');
    expect(r.pecaSugerida.peca).toBeTruthy();
    expect(r.baseLegal).toBeTruthy();
    expect(r.confianca).toBeGreaterThan(0);
    expect(r.startDate).toBeTruthy();
    expect(r.dueDate).toBeTruthy();
  });

  it('ato sem prazo nunca devolve vencimento', () => {
    const r = d('Ciência às partes do desarquivamento dos autos.');
    expect(r.dueDate).toBeNull();
  });
});

describe('ministro — acórdão que já julgou a apelação', () => {
  it('acórdão que dá parcial provimento à apelação não sugere nova apelação', () => {
    const r = d('INTIMAÇÃO DE ACÓRDÃO Nº 1035120-70.2022.8.26.0114 - Apelação Cível - Campinas - Apelante: Elson - Apelado: Claudia - Deram parcial provimento ao recurso, com determinação. V. U. - ART. 1007 CPC - EVENTUAL RECURSO - SE AO STJ: CUSTAS R$ 270,12.', { tribunal: 'TJSP' });
    expect(r.pecaSugerida.peca).not.toMatch(/Apela/);
    expect(r.days).toBe(5);
    expect(r.pecaSugerida.peca).toBe('Embargos de Declaração');
  });
});
