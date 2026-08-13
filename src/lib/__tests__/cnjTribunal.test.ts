import { describe, expect, it } from 'vitest';
import { sistemaFromContent, tribunalFromCNJ } from '@/lib/cnjTribunal';

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