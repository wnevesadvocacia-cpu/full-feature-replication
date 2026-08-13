import { describe, it, expect } from 'vitest';
import { detectDeadline } from '../legalDeadlines';

// Bateria de revisão "in totum" do motor: cada caso reproduz linguagem real de publicação
// e fixa (a) prazo em dias, (b) peça sugerida, (c) aplicação/afastamento do dobro.
const REF = '2026-08-06'; // quinta-feira útil

const det = (t: string) => detectDeadline(t, REF, REF)!;

describe('motor de prazos — dobro (CPC 183/180/186)', () => {
  it('ente público apenas como polo adverso NÃO dobra e registra afastamento', () => {
    const d = det('Embargos de Declaração Cível. Embargte: Neusa Aparecida Moro - Embargdo: Estado de São Paulo - Magistrado Martin Vargas - Rejeitaram os embargos. V. U. 10ª Câmara de Direito Público.');
    expect(d.doubled).toBe(false);
    expect(d.doubleWaivedReason).toMatch(/dobro NÃO aplicado|AFASTADO/);
    expect(d.days).toBe(15);
  });

  it('ente público como parte atuante dobra o prazo', () => {
    const d = det('A FAZENDA PÚBLICA Estadual interpõe apelação contra a sentença.');
    expect(d.doubled).toBe(true);
    expect(d.days).toBe(30);
  });

  it('procuradoria/PGE intimada dobra o prazo', () => {
    const d = det('Intime-se a Procuradoria Geral do Estado para apresentar contestação.');
    expect(d.doubled).toBe(true);
    expect(d.days).toBe(30);
  });

  it('cabeçalho institucional do tribunal nunca dobra', () => {
    const d = det('TRIBUNAL DE JUSTIÇA DO ESTADO DE SÃO PAULO. Apresente contestação.');
    expect(d.doubled).toBe(false);
    expect(d.days).toBe(15);
  });

  it('litisconsortes com procuradores distintos em autos eletrônicos não dobra (art. 229 §2º)', () => {
    const d = det('Litisconsortes com procuradores distintos. Autos eletrônicos (PJe). Apresente apelação.');
    expect(d.doubled).toBe(false);
    expect(d.doubleWaivedReason).toMatch(/229/);
  });
});

describe('motor de prazos — recursos e instância', () => {
  it('negativa de seguimento de RE por tema de repercussão geral → agravo interno, não recurso inominado', () => {
    const d = det('Recurso Inominado Cível. Em cumprimento ao despacho do Supremo Tribunal Federal, observado o tema 956, NEGO SEGUIMENTO ao presente recurso extraordinário, nos termos do art. 1.030, I, a do CPC. Recorrido: Estado de São Paulo. Int.');
    expect(d.days).toBe(15);
    expect(d.doubled).toBe(false);
    expect(d.pecaSugerida.peca).toBe('Agravo Interno');
    expect(d.baseLegal).toMatch(/1\.030 §2º/);
  });

  it('acórdão com EDcl rejeitados → RE/REsp 15 d.u.', () => {
    const d = det('ACÓRDÃO. Rejeitaram os embargos de declaração. V. U. 10ª Câmara de Direito Público.');
    expect(d.days).toBe(15);
    expect(d.pecaSugerida.peca).toMatch(/Especial/);
  });

  it('EDcl opostos em 1º grau mantêm 5 d.u.', () => {
    const d = det('Oponho embargos de declaração contra a sentença.');
    expect(d.days).toBe(5);
    expect(d.pecaSugerida.peca).toMatch(/Embargos de Declara/);
  });

  it('agravo de instrumento 15 d.u.', () => {
    const d = det('Interposto agravo de instrumento contra a decisão que indeferiu a tutela.');
    expect(d.days).toBe(15);
    expect(d.pecaSugerida.peca).toMatch(/Agravo de Instrumento/);
  });

  it('agravo interno 15 d.u.', () => {
    const d = det('Cabe agravo interno da decisão monocrática do relator.');
    expect(d.days).toBe(15);
  });

  it('contrarrazões de apelação 15 d.u.', () => {
    const d = det('Intime-se o apelado para apresentar contrarrazões.');
    expect(d.days).toBe(15);
    expect(d.pecaSugerida.peca).toMatch(/Contrarraz/);
  });
});

describe('motor de prazos — juizados especiais', () => {
  it('recurso inominado 10 d.u.', () => {
    const d = det('Juizado Especial Cível. Cabe recurso inominado da sentença.');
    expect(d.days).toBe(10);
    expect(d.source).toBe('JEC');
  });

  it('EDcl no JEC 5 d.u. (Lei 9.099 art. 48)', () => {
    const d = det('Turma Recursal. Opostos embargos de declaração pela parte ré.');
    expect(d.days).toBe(5);
    expect(d.source).toBe('JEC');
  });

  it('preparo do JEC em 48 horas (dias corridos)', () => {
    const d = det('Recolha o preparo em 48 horas, sob pena de deserção.');
    expect(d.unit).toBe('dias_corridos');
    expect(d.days).toBe(2);
  });

  it('contrarrazões de recurso inominado com prazo literal de 15 respeita o texto', () => {
    const d = det('Juizado Especial. Intimação para que no prazo de 15 (quinze) apresentar as contrarrazões ao recurso inominado.');
    expect(d.days).toBe(15);
    expect(d.doubled).toBe(false);
  });
});

describe('motor de prazos — trabalhista e criminal', () => {
  it('recurso ordinário trabalhista 8 dias (CLT)', () => {
    const d = det('TRT. Justiça do Trabalho. Reclamante interpôs recurso ordinário.');
    expect(d.source).toBe('CLT');
    expect(d.days).toBe(8);
  });

  it('apelação criminal 5 dias (CPP)', () => {
    const d = det('Ação penal. Vara Criminal. Cabe apelação da sentença condenatória, art. 593 do CPP.');
    expect(d.source).toBe('CPP');
    expect(d.days).toBe(5);
  });
});

describe('motor de prazos — atos postulatórios e regra geral', () => {
  it('contestação 15 d.u.', () => {
    const d = det('Cite-se o réu para apresentar contestação.');
    expect(d.days).toBe(15);
    expect(d.pecaSugerida.peca).toBe('Contestação');
  });

  it('impugnação ao cumprimento de sentença 15 d.u.', () => {
    const d = det('Prazo para impugnação ao cumprimento de sentença.');
    expect(d.days).toBe(15);
  });

  it('embargos à execução 15 d.u.', () => {
    const d = det('Intime-se para opor embargos a execução.');
    expect(d.days).toBe(15);
  });

  it('prazo literal em dias corridos é respeitado', () => {
    const d = det('Comprove o pagamento em até 30 dias corridos.');
    expect(d.unit).toBe('dias_corridos');
    expect(d.days).toBe(30);
  });

  it('sem prazo expresso cai na regra geral de 5 d.u. (art. 218 §3º)', () => {
    const d = det('Cumpra-se o despacho proferido nos autos.');
    expect(d.isFallback).toBe(true);
    expect(d.days).toBe(5);
  });

  it('toda detecção traz peça, base legal, confiança e status', () => {
    const d = det('Apresente contestação no prazo legal.');
    expect(d.pecaSugerida.peca).toBeTruthy();
    expect(d.baseLegal).toBeTruthy();
    expect(d.confianca).toBeGreaterThan(0);
    expect(['auto_alta', 'auto_media', 'auto_baixa', 'ambigua_urgente']).toContain(d.classificacaoStatus);
  });

  it('vencimento sempre recai em dia útil', () => {
    const d = det('Manifeste-se no prazo de 10 dias.');
    expect(d.dueDate).toBeTruthy();
    expect(d.startDate).toBeTruthy();
  });
});

describe('motor — publicações sem prazo (coerência)', () => {
  it('despacho que admite recurso já interposto e remete à pauta virtual não abre prazo', () => {
    const det = detectDeadline(
      'Recurso de apelação hábil a processamento em ambos os efeitos, nos termos do art. 1.012 do CPC. Encaminhem-se os autos para inserção do recurso em pauta de julgamento eletrônico (virtual), com publicação prévia da pauta.',
      '2026-08-10', '2026-08-10',
    );
    expect(det?.days).toBe(0);
    expect(det?.dueDate).toBeNull();
  });

  it('arquivamento/trânsito em julgado é informativo, sem fallback de 5 dias', () => {
    const det = detectDeadline('Certifico o trânsito em julgado da sentença. Arquive-se.', '2026-08-10', '2026-08-10');
    expect(det?.days).toBe(0);
    expect(det?.isFallback).toBe(false);
  });

  it('ato informativo com determinação expressa mantém prazo', () => {
    const det = detectDeadline('Expeça-se ofício. Manifeste-se a parte autora no prazo de 5 dias.', '2026-08-10', '2026-08-10');
    expect(det?.days).toBe(5);
  });
});

describe('motor — migração de sistema processual', () => {
  it('comunicação de migração para o eproc é apenas ciência, sem prazo', () => {
    const d = detectDeadline(
      'Ficam as partes e respectivos representantes cientificados de que o presente processo passará a tramitar eletronicamente no Sistema Eproc do Tribunal de Justiça do Estado de São Paulo. Ficam intimados os procuradores para que providenciem o credenciamento no eproc. As comunicações subsequentes serão realizadas pelo sistema eproc.',
      REF, REF,
    )!;
    expect(d.days).toBe(0);
    expect(d.dueDate).toBeNull();
    expect(d.isFallback).toBe(false);
    expect(d.label).toMatch(/ciência de migração/);
  });
});

describe('motor — entrada de autos (expediente administrativo)', () => {
  it('“PROCESSO ENTRADO EM” / entrada de autos não abre prazo de apelação', () => {
    const d = detectDeadline(
      'Entrada de Autos de Direito Público, Câm. Espec. e Meio Ambiente. PROCESSO ENTRADO EM 03/08/2026. 1031942-89.2017.8.26.0114; Processo Digital. Petições para juntada devem ser apresentadas exclusivamente por meio eletrônico, nos termos do artigo 7º da Res. 551/2011; Apelação Cível; Apelante: Jose Mauricio Sanfins; Apelado: Estado de São Paulo',
      '2026-08-12', '2026-08-13',
    )!;
    expect(d.days).toBe(0);
    expect(d.dueDate).toBeNull();
    expect(d.isFallback).toBe(false);
    expect(d.pecaSugerida.peca).toMatch(/Ciência/);
  });
});
