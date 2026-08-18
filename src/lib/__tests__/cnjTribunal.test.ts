import { describe, expect, it } from 'vitest';
import { instanciaFromContext, sistemaFromContent, tribunalFromCNJ } from '@/lib/cnjTribunal';

describe('identificação do sistema processual', () => {
  it('identifica publicação originada do eproc mesmo sem menção textual ao nome do sistema', () => {
    const content = `
      EXECUÇÃO DE TÍTULO EXTRAJUDICIAL Nº 1009775-68.2023.8.26.0114/SP
      EXEQUENTE: WILLIAM ROBSON DAS NEVES
      ADVOGADO(A): WILLIAM ROBSON DAS NEVES (OAB SP290702)
      DESPACHO/DECISÃO Vistos. Intime-se.
    `;

    expect(sistemaFromContent(content)).toBe('eproc');
    expect(tribunalFromCNJ('1009775-68.2023.8.26.0114', content)?.sistema).toBe('eproc');
  });

  it('identifica eproc quando o DJEN concatena o nome com ADVOGADO(A)', () => {
    const content = `
      Intimação Processo: 1009775-68.2023.8.26.0114
      EXECUÇÃO DE TÍTULO EXTRAJUDICIAL Nº 1009775-68.2023.8.26.0114/SP
      EXEQUENTE: WILLIAM ROBSON DAS NEVESADVOGADO(A): WILLIAM ROBSON DAS NEVES (OAB SP290702)
      DESPACHO/DECISÃO Vistos. Intime-se.
    `;

    expect(sistemaFromContent(content)).toBe('eproc');
    expect(tribunalFromCNJ('1009775-68.2023.8.26.0114', content)?.sistema).toBe('eproc');
  });

  it('não confunde a publicação tradicional do e-SAJ com eproc', () => {
    const content = `
      Processo 1009775-68.2023.8.26.0114 - Execução de Título Extrajudicial
      William Robson das Neves - Intime-se. - ADV: WILLIAM ROBSON DAS NEVES (OAB 290702/SP)
    `;

    expect(sistemaFromContent(content)).toBeNull();
    expect(tribunalFromCNJ('1009775-68.2023.8.26.0114', content)?.sistema).toBe('e-SAJ');
  });
});
describe('identificação do grau de jurisdição', () => {
  it('reconhece sessão virtual / pauta de julgamento como 2º Grau', () => {
    expect(instanciaFromContext('1001630-35.2017.8.26.0372', 'EXTRATO DE ATA DA SESSÃO VIRTUAL. Nego seguimento.')).toBe('2º Grau');
    expect(instanciaFromContext('1001630-35.2017.8.26.0372', 'Inclusão do recurso em pauta de julgamento eletrônico.')).toBe('2º Grau');
  });

  it('reconhece juízo de admissibilidade / vice-presidência como 2º Grau', () => {
    expect(instanciaFromContext('1001630-35.2017.8.26.0372', 'Vice-Presidência. Juízo de admissibilidade do recurso extraordinário.')).toBe('2º Grau');
  });

  it('mantém 1º Grau para publicação de vara e Turma Recursal para colégio recursal', () => {
    expect(instanciaFromContext('0000389-65.2022.8.26.0114', '2ª Vara Cível do Foro de São Paulo. Manifeste-se.')).toBe('1º Grau');
    expect(instanciaFromContext('1020093-79.2024.8.26.0016', '3ª TURMA RECURSAL CÍVEL. Negar provimento.')).toBe('Turma Recursal');
  });

  it('usa fallback pelo CNJ quando não há pistas textuais', () => {
    expect(instanciaFromContext('1001630-35.2017.8.26.0372', 'Intime-se.')).toBe('1º Grau');
    expect(instanciaFromContext('2100000-00.2026.8.26.0000', 'Intime-se.')).toBe('2º Grau');
  });
});
