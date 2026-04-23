// Calendário oficial CNJ — feriados nacionais + recesso forense (20/12 a 20/01) + sábados/domingos.
// Base: Lei 5.010/66 art. 62 + feriados nacionais fixos. Não inclui feriados estaduais/municipais.

const FIXED: Array<[number, number]> = [
  [1, 1],   // Confraternização Universal
  [4, 21],  // Tiradentes
  [5, 1],   // Dia do Trabalho
  [9, 7],   // Independência
  [10, 12], // N. Sra. Aparecida
  [11, 2],  // Finados
  [11, 15], // Proclamação da República
  [11, 20], // Consciência Negra (lei 14.759/2023)
  [12, 25], // Natal
  [12, 8],  // Dia da Justiça (recesso forense, art. 62 V Lei 5.010/66)
];

// Páscoa (algoritmo de Meeus/Jones/Butcher) → calcula Carnaval, Sexta Santa, Corpus Christi
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Retorna conjunto de strings YYYY-MM-DD considerados não-úteis
export function getCnjHolidays(year: number): Set<string> {
  const set = new Set<string>();
  FIXED.forEach(([m, d]) => set.add(fmt(new Date(Date.UTC(year, m - 1, d)))));
  const easter = easterSunday(year);
  set.add(fmt(addDays(easter, -48))); // Carnaval segunda
  set.add(fmt(addDays(easter, -47))); // Carnaval terça
  set.add(fmt(addDays(easter, -2)));  // Sexta-feira Santa
  set.add(fmt(addDays(easter, 60)));  // Corpus Christi
  return set;
}

// Recesso forense: 20/12 a 20/01 (art. 220 §1º CPC)
function inRecesso(iso: string): boolean {
  const [, mm, dd] = iso.split('-').map(Number);
  if (mm === 12 && dd >= 20) return true;
  if (mm === 1 && dd <= 20) return true;
  return false;
}

export function isBusinessDay(iso: string): boolean {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (inRecesso(iso)) return false;
  const yearHolidays = getCnjHolidays(d.getUTCFullYear());
  return !yearHolidays.has(iso);
}

export function nextBusinessDay(iso: string): string {
  let d = new Date(iso + 'T12:00:00Z');
  do { d = addDays(d, 1); } while (!isBusinessDay(fmt(d)));
  return fmt(d);
}

export function previousBusinessDay(iso: string): string {
  let d = new Date(iso + 'T12:00:00Z');
  do { d = addDays(d, -1); } while (!isBusinessDay(fmt(d)));
  return fmt(d);
}

// Formata YYYY-MM-DD em pt-BR sem timezone shift
export function formatBR(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
}

export function todayISO(): string {
  return fmt(new Date());
}
