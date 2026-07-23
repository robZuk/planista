import type { DayOfWeek } from '@/types';

/**
 * Daty w planie porownujemy ZAWSZE po tekscie "YYYY-MM-DD", nigdy po obiekcie Date.
 * Backend zapisuje terminy jako polnoc UTC, a przegladarka jest w strefie lokalnej —
 * konwersja tam i z powrotem potrafi przesunac termin o dzien.
 */

const DAY_ENUM: DayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

/** "2026-10-05T00:00:00.000Z" -> "2026-10-05" */
export function toDateKey(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Poniedzialek tygodnia, w ktorym lezy `date`. */
export function startOfWeek(date: Date): Date {
  const day = date.getDay(); // 0 = niedziela
  const diff = day === 0 ? -6 : 1 - day;
  const monday = addDays(date, diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Siedem kolejnych dat, zaczynajac od poniedzialku. */
export function weekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function dayOfWeekOf(date: Date): DayOfWeek {
  return DAY_ENUM[date.getDay()]!;
}

export function formatDayShort(date: Date): string {
  return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
}

export function formatDateLong(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Zakres tygodnia w formie "05.10 – 11.10.2026" do naglowka. */
export function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  return `${formatDayShort(monday)} – ${sunday.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;
}
