// Calendário oficial CNJ — feriados nacionais + recesso forense (20/12 a 20/01) + sábados/domingos.
// Base: Lei 5.010/66 art. 62 + Lei 14.759/2023 (Consciência Negra).
// Suporte a feriados estaduais por tribunal (tabela tribunal_holidays) e suspensões
// excepcionais (tabela judicial_suspensions) — carregadas via setSuspensionWindow / setTribunalHolidaySet.

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

import type { CityKey } from './cityHolidays';
import { getCityHolidays } from './cityHolidays';

// ============= GAP 2 + 3: integração suspensões + feriados de tribunal =============
// O frontend hidrata esses sets via hook (useLegalCalendar) que faz select nas tabelas
// judicial_suspensions e tribunal_holidays. Mantemos APIs síncronas para não quebrar
// o resto do código.
let suspendedDates = new Set<string>();
let tribunalHolidaySets = new Map<string, Set<string>>(); // tribunal -> set ISO

export function setSuspensionWindow(dates: Iterable<string>) {
  suspendedDates = new Set(dates);
}
export function setTribunalHolidaySet(tribunal: string, dates: Iterable<string>) {
  tribunalHolidaySets.set(tribunal.toUpperCase(), new Set(dates));
}
export function clearLegalCalendarCache() {
  suspendedDates.clear();
  tribunalHolidaySets.clear();
}

export interface BusinessDayContext {
  location?: CityKey;
  tribunal?: string; // ex.: 'TJSP', 'TJRJ', 'TRF3'
}

export function isBusinessDay(iso: string, ctx?: CityKey | BusinessDayContext): boolean {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (inRecesso(iso)) return false;
  const year = d.getUTCFullYear();
  if (getCnjHolidays(year).has(iso)) return false;

  // GAP 2: suspensão geral (CNJ ou específica do tribunal)
  if (suspendedDates.has(iso)) return false;

  // Backwards-compat: ctx pode ser CityKey antigo
  const c: BusinessDayContext = ctx && 'uf' in (ctx as any) ? { location: ctx as CityKey } : ((ctx as BusinessDayContext) ?? {});

  if (c.location && getCityHolidays(year, c.location).has(iso)) return false;

  // GAP 3: feriados estaduais por tribunal
  if (c.tribunal) {
    const tset = tribunalHolidaySets.get(c.tribunal.toUpperCase());
    if (tset?.has(iso)) return false;
  }
  return true;
}

export function nextBusinessDay(iso: string, ctx?: CityKey | BusinessDayContext): string {
  let d = new Date(iso + 'T12:00:00Z');
  do { d = addDays(d, 1); } while (!isBusinessDay(fmt(d), ctx));
  return fmt(d);
}

export function previousBusinessDay(iso: string, ctx?: CityKey | BusinessDayContext): string {
  let d = new Date(iso + 'T12:00:00Z');
  do { d = addDays(d, -1); } while (!isBusinessDay(fmt(d), ctx));
  return fmt(d);
}

/** GAP 1 / CPC art. 224 §1º: se data cair em sab/dom/feriado/recesso/suspensão, prorroga p/ próximo dia útil. */
export function ensureBusinessDay(iso: string, ctx?: CityKey | BusinessDayContext): string {
  return isBusinessDay(iso, ctx) ? iso : nextBusinessDay(iso, ctx);
}

export function formatBR(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
}

/** Sprint1.8: "hoje" no timezone America/Sao_Paulo (não no TZ do navegador).
 *  Crítico: usuário em viagem no exterior continua vendo prazos do fuso BR. */
export function todayISO(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date()); // en-CA já entrega YYYY-MM-DD
}
