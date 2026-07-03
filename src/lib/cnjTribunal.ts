// Resolve tribunal a partir do número CNJ com precisão cirúrgica.
// Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
// J = segmento do Poder Judiciário; TR = tribunal dentro do segmento.

// Códigos CNJ dos Tribunais de Justiça (ordem alfabética oficial), NÃO confundir com IBGE.
// Códigos oficiais CNJ (Res. 65/2008) — ordem alfabética das UFs.
// Atenção: NÃO seguem IBGE. Ex.: 16=PR, 17=PE, 18=PI, 21=RS, 22=RO, 23=RR.
const UF_BY_CODE: Record<string, string> = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE',
  '07': 'DF', '08': 'ES', '09': 'GO', '10': 'MA', '11': 'MT', '12': 'MS',
  '13': 'MG', '14': 'PA', '15': 'PB', '16': 'PR', '17': 'PE', '18': 'PI',
  '19': 'RJ', '20': 'RN', '21': 'RS', '22': 'RO', '23': 'RR', '24': 'SC',
  '25': 'SE', '26': 'SP', '27': 'TO',
};

export type TribunalInfo = {
  sigla: string;        // ex.: TJSP, TRF3, TRT02, TJM-SP
  nome: string;         // nome por extenso
  segmento: string;     // ex.: "Justiça Estadual"
  uf?: string;          // quando aplicável
  cnjValido: boolean;
};

export function tribunalFromCNJ(numero?: string | null): TribunalInfo | null {
  if (!numero) return null;
  const digits = numero.replace(/\D/g, '');
  if (digits.length !== 20) return { sigla: '—', nome: 'Número CNJ inválido', segmento: '—', cnjValido: false };
  const J = digits.substring(13, 14);
  const TR = digits.substring(14, 16);

  switch (J) {
    case '1':
      return { sigla: 'STF', nome: 'Supremo Tribunal Federal', segmento: 'Tribunais Superiores', cnjValido: true };
    case '2':
      return { sigla: 'CNJ', nome: 'Conselho Nacional de Justiça', segmento: 'Órgão de Controle', cnjValido: true };
    case '3':
      return { sigla: 'STJ', nome: 'Superior Tribunal de Justiça', segmento: 'Tribunais Superiores', cnjValido: true };
    case '4': {
      // 90=TNU/CJF; 01..06=TRF1..TRF6
      if (TR === '90') return { sigla: 'CJF', nome: 'Conselho da Justiça Federal', segmento: 'Justiça Federal', cnjValido: true };
      const n = parseInt(TR, 10);
      if (n >= 1 && n <= 6) return { sigla: `TRF${n}`, nome: `Tribunal Regional Federal da ${n}ª Região`, segmento: 'Justiça Federal', cnjValido: true };
      return { sigla: 'JF', nome: 'Justiça Federal', segmento: 'Justiça Federal', cnjValido: true };
    }
    case '5': {
      if (TR === '90') return { sigla: 'TST', nome: 'Tribunal Superior do Trabalho', segmento: 'Justiça do Trabalho', cnjValido: true };
      const n = parseInt(TR, 10);
      if (n >= 1 && n <= 24) return { sigla: `TRT${TR}`, nome: `Tribunal Regional do Trabalho da ${n}ª Região`, segmento: 'Justiça do Trabalho', cnjValido: true };
      return { sigla: 'JT', nome: 'Justiça do Trabalho', segmento: 'Justiça do Trabalho', cnjValido: true };
    }
    case '6': {
      if (TR === '00') return { sigla: 'TSE', nome: 'Tribunal Superior Eleitoral', segmento: 'Justiça Eleitoral', cnjValido: true };
      const uf = UF_BY_CODE[TR];
      if (uf) return { sigla: `TRE-${uf}`, nome: `Tribunal Regional Eleitoral de ${uf}`, segmento: 'Justiça Eleitoral', uf, cnjValido: true };
      return { sigla: 'JE', nome: 'Justiça Eleitoral', segmento: 'Justiça Eleitoral', cnjValido: true };
    }
    case '7':
      return { sigla: 'STM', nome: 'Superior Tribunal Militar', segmento: 'Justiça Militar da União', cnjValido: true };
    case '8': {
      if (TR === '07') return { sigla: 'TJDFT', nome: 'Tribunal de Justiça do Distrito Federal e Territórios', segmento: 'Justiça Estadual', uf: 'DF', cnjValido: true };
      const uf = UF_BY_CODE[TR];
      if (uf) return { sigla: `TJ${uf}`, nome: `Tribunal de Justiça de ${uf}`, segmento: 'Justiça Estadual', uf, cnjValido: true };
      return { sigla: 'TJ', nome: 'Justiça Estadual', segmento: 'Justiça Estadual', cnjValido: true };
    }
    case '9': {
      const uf = UF_BY_CODE[TR];
      if (uf) return { sigla: `TJM-${uf}`, nome: `Tribunal de Justiça Militar de ${uf}`, segmento: 'Justiça Militar Estadual', uf, cnjValido: true };
      return { sigla: 'JME', nome: 'Justiça Militar Estadual', segmento: 'Justiça Militar Estadual', cnjValido: true };
    }
    default:
      return { sigla: '—', nome: 'Segmento desconhecido', segmento: '—', cnjValido: false };
  }
}
