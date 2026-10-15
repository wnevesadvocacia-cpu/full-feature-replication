// Port Deno-compatível de src/lib/cnjCalendar.ts (PR2 — edge unificada).
// Mantém API idêntica. Diferenças vs frontend:
//   * cityHolidays removido (edge não exibe agenda municipal).
//   * suspensions/tribunal_holidays são hidratados pelas funções antes do cálculo.

const FIXED: Array<[number, number]> = [
  [1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25], [12, 8],
];

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
function fmt(d: Date): string { return d.toISOString().slice(0, 10); }

export function getCnjHolidays(year: number): Set<string> {
  const set = new Set<string>();
  FIXED.forEach(([m, d]) => set.add(fmt(new Date(Date.UTC(year, m - 1, d)))));
  const easter = easterSunday(year);
  set.add(fmt(addDays(easter, -48)));
  set.add(fmt(addDays(easter, -47)));
  set.add(fmt(addDays(easter, -2)));
  set.add(fmt(addDays(easter, 60)));
  return set;
}

function inRecesso(iso: string): boolean {
  const [, mm, dd] = iso.split('-').map(Number);
  if (mm === 12 && dd >= 20) return true;
  if (mm === 1 && dd <= 20) return true;
  return false;
}

let suspendedDates = new Set<string>();
let tribunalHolidaySets = new Map<string, Set<string>>();
let tribunalSuspensions = new Map<string, Set<string>>();
function tribunalKey(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '').replace(/^(TRT|TRF)0+(\d)/, '$1$2');
}

export function setSuspensionWindow(dates: Iterable<string>, tribunal?: string | null) {
  if (tribunal) tribunalSuspensions.set(tribunalKey(tribunal), new Set(dates));
  else suspendedDates = new Set(dates);
}
export function setTribunalHolidaySet(tribunal: string, dates: Iterable<string>) {
  tribunalHolidaySets.set(tribunalKey(tribunal), new Set(dates));
}
export function clearLegalCalendarCache() { suspendedDates.clear(); tribunalHolidaySets.clear(); tribunalSuspensions.clear(); }

export interface BusinessDayContext { tribunal?: string; ignoreRecess?: boolean; }

export function getCalendarExclusion(iso: string, ctx?: BusinessDayContext): 'sabado' | 'domingo' | 'recesso' | 'feriado_cnj' | 'feriado_local' | 'suspensao' | null {
  const d = new Date(iso + 'T12:00:00Z');
  if (d.getUTCDay() === 6) return 'sabado';
  if (d.getUTCDay() === 0) return 'domingo';
  if (!ctx?.ignoreRecess && inRecesso(iso)) return 'recesso';
  if (getCnjHolidays(d.getUTCFullYear()).has(iso)) return 'feriado_cnj';
  const tribunal = ctx?.tribunal ? tribunalKey(ctx.tribunal) : undefined;
  if (suspendedDates.has(iso) || (tribunal && tribunalSuspensions.get(tribunal)?.has(iso))) return 'suspensao';
  if (tribunal && tribunalHolidaySets.get(tribunal)?.has(iso)) return 'feriado_local';
  return null;
}

export function isBusinessDay(iso: string, ctx?: string | BusinessDayContext): boolean {
  return getCalendarExclusion(iso, typeof ctx === 'string' ? { tribunal: ctx } : ctx) === null;
}

export function nextBusinessDay(iso: string, ctx?: string | BusinessDayContext): string {
  let d = new Date(iso + 'T12:00:00Z');
  do { d = addDays(d, 1); } while (!isBusinessDay(fmt(d), ctx));
  return fmt(d);
}

export function previousBusinessDay(iso: string, ctx?: string | BusinessDayContext): string {
  let d = new Date(iso + 'T12:00:00Z');
  do { d = addDays(d, -1); } while (!isBusinessDay(fmt(d), ctx));
  return fmt(d);
}

export function ensureBusinessDay(iso: string, ctx?: string | BusinessDayContext): string {
  return isBusinessDay(iso, ctx) ? iso : nextBusinessDay(iso, ctx);
}

export function todayISO(): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return f.format(new Date());
}
