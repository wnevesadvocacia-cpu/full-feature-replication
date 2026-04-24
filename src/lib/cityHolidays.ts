// Feriados estaduais e municipais relevantes para o Judiciário (forenses).
// Fonte: leis estaduais/municipais e provimentos dos TJs respectivos.
// IMPORTANTE: lista curada das principais capitais. Para cidades não listadas,
// apenas feriados nacionais (calendário CNJ base) são aplicados.

export interface CityKey {
  uf: string;       // sigla, ex: 'SP'
  city?: string;    // slug minúsculo sem acento, ex: 'sao paulo'. Omitido = só estado.
}

interface HolidaySpec {
  // Data fixa (mês/dia) — repetida todo ano
  fixed?: Array<[number, number]>;
  // Feriados móveis em offset de Páscoa (raros; reservado para extensão futura)
  easterOffsets?: number[];
  description?: string;
}

// Chave: 'UF' (estado) ou 'UF:cidade-slug' (município)
const HOLIDAYS: Record<string, HolidaySpec> = {
  // ===== Estados =====
  'SP': { fixed: [[7, 9]], description: 'Revolução Constitucionalista' },
  'RJ': { fixed: [[4, 23], [11, 20]], description: 'São Jorge + Consciência Negra (já federal)' },
  'MG': { fixed: [[4, 21]], description: 'Tiradentes (já federal — mantido por simbolismo)' },
  'BA': { fixed: [[7, 2]], description: 'Independência da Bahia' },
  'CE': { fixed: [[3, 25]], description: 'Data Magna do Ceará' },
  'PE': { fixed: [[3, 6]], description: 'Revolução Pernambucana' },
  'AM': { fixed: [[9, 5]], description: 'Elevação do Amazonas a província' },
  'PA': { fixed: [[8, 15]], description: 'Adesão do Pará à Independência' },
  'RS': { fixed: [[9, 20]], description: 'Revolução Farroupilha' },

  // ===== Capitais (município:cidade-slug) =====
  'SP:sao paulo': { fixed: [[1, 25]], description: 'Aniversário de São Paulo' },
  'RJ:rio de janeiro': { fixed: [[1, 20], [3, 1]], description: 'São Sebastião + Aniversário do Rio' },
  'DF:brasilia': { fixed: [[4, 21]], description: 'Fundação de Brasília (coincide com Tiradentes)' },
  'MG:belo horizonte': { fixed: [[12, 12]], description: 'Aniversário de BH' },
  'BA:salvador': { fixed: [[7, 2]], description: 'Independência da Bahia' },
  'CE:fortaleza': { fixed: [[4, 13]], description: 'Aniversário de Fortaleza' },
  'PR:curitiba': { fixed: [[9, 8]], description: 'Aniversário de Curitiba' },
  'RS:porto alegre': { fixed: [[3, 26]], description: 'Aniversário de Porto Alegre' },
  'PE:recife': { fixed: [[3, 12]], description: 'Aniversário de Recife' },
};

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function fmtUTC(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/** Retorna feriados ESPECÍFICOS de uma localidade (não inclui os nacionais — esses vêm de getCnjHolidays). */
export function getCityHolidays(year: number, key: CityKey): Set<string> {
  const out = new Set<string>();
  const uf = key.uf.toUpperCase();
  const stateSpec = HOLIDAYS[uf];
  if (stateSpec?.fixed) stateSpec.fixed.forEach(([m, d]) => out.add(fmtUTC(year, m, d)));
  if (key.city) {
    const citySpec = HOLIDAYS[`${uf}:${slugify(key.city)}`];
    if (citySpec?.fixed) citySpec.fixed.forEach(([m, d]) => out.add(fmtUTC(year, m, d)));
  }
  return out;
}

export function listSupportedLocations(): string[] {
  return Object.keys(HOLIDAYS);
}
