import type { ClassType, DayOfWeek, RoomType, StudyMode, WeekType, SemesterType } from '@prisma/client';

/**
 * Logika czasowa planu zajec — wspolna dla walidacji, generatora i przenoszenia.
 *
 * W planista7 czas jest wyrazany BLOKAMI 1-godzinnymi (TimeBlock.order), a nie
 * stringami godzin. Konflikt czasu = nakladanie sie przedzialow `order` (arytmetyka
 * na liczbach calkowitych), patrz `rangesOverlap`.
 */

// ─── Nakladanie sie przedzialow blokow (domkniete) ───────────
// Zajecie zajmuje bloki [aStart..aEnd] wlacznie. Dwa zajecia koliduja w czasie,
// gdy ich przedzialy order sie przecinaja.
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

// ─── Typy sal dopuszczalne dla typu zajec ────────────────────
// SPORTS tylko przy cwiczeniach — WF idzie w siatce wlasnie jako ta forma,
// a bez tego wpisu hala i silownia byly nieuzywalne w calym systemie.
export const roomTypeMap: Record<ClassType, RoomType[]> = {
  LECTURE: ['LECTURE', 'EXERCISE'],
  EXERCISE: ['EXERCISE', 'LECTURE', 'SPORTS'],
  LAB: ['LAB', 'COMPUTER_LAB'],
  PROJECT: ['EXERCISE', 'COMPUTER_LAB', 'SEMINAR'],
  SEMINAR: ['SEMINAR', 'EXERCISE'],
};

// ─── Typy tygodnia kompatybilne (nie koliduja) z danym typem ─
// EVEN i ODD zajmuja rozne tygodnie kalendarzowe -> moga dzielic sale/prowadzacego/slot.
export function compatibleWeekTypes(weekType: WeekType): WeekType[] {
  if (weekType === 'EVEN') return ['ODD'];
  if (weekType === 'ODD') return ['EVEN'];
  return []; // EVERY koliduje ze wszystkim
}

// ─── Mapy dni tygodnia ───────────────────────────────────────
export const dayEnumToNum: Record<DayOfWeek, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export const dayNumToEnum: Record<number, DayOfWeek> = {
  0: 'SUNDAY',
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
};

function minutesFromTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ─── Okno czasowe trybu studiow ──────────────────────────────
// FULL_TIME: pon-pt caly dzien. PART_TIME: pt od 15:00, sob/nd caly dzien.
export function isDayAllowedForMode(dayNum: number, studyMode: StudyMode): boolean {
  if (studyMode === 'FULL_TIME') return dayNum >= 1 && dayNum <= 5;
  return dayNum === 5 || dayNum === 6 || dayNum === 0; // pt/sob/nd
}

/** Sprawdza okno trybu; zwraca komunikat bledu lub null. `startTime` = godzina startu bloku. */
export function checkTimeWindow(dayNum: number, startTime: string, studyMode: StudyMode): string | null {
  if (studyMode === 'FULL_TIME') {
    if (dayNum < 1 || dayNum > 5) return 'Studia stacjonarne: dozwolone tylko poniedzialek-piatek';
    return null;
  }
  // PART_TIME
  if (dayNum >= 1 && dayNum <= 4) return 'Studia niestacjonarne: zajecia tylko pt/sob/nd';
  if (dayNum === 5 && minutesFromTime(startTime) < 15 * 60) return 'Studia niestacjonarne: piatek dopiero od 15:00';
  return null;
}

// ─── Daty semestru ───────────────────────────────────────────
export function dateToStr(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/** Czy data wypada w oknie trybu studiow (przy generowaniu terminow). */
export function isInStudyModeWindow(date: Date, studyMode: StudyMode, startTime: string): boolean {
  const day = date.getUTCDay();
  if (studyMode === 'FULL_TIME') return day >= 1 && day <= 5;
  if (day === 6 || day === 0) return true;
  if (day === 5) return minutesFromTime(startTime) >= 15 * 60;
  return false;
}

/**
 * Wszystkie daty w [startDate, endDate] wypadajace w dany dzien tygodnia,
 * z uwzglednieniem weekType (co tydzien / parzyste / nieparzyste).
 * Uzywa poludnia UTC — odporne na zmiany czasu (DST +-1h nie przekracza granicy doby).
 */
export function getDatesForDayOfWeek(
  startDate: Date,
  endDate: Date,
  dayOfWeek: DayOfWeek,
  weekType: WeekType,
): Date[] {
  const targetDay = dayEnumToNum[dayOfWeek];
  const dates: Date[] = [];

  const current = new Date(startDate);
  current.setUTCHours(12, 0, 0, 0);
  while (current.getUTCDay() !== targetDay) {
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const endNoon = new Date(endDate);
  endNoon.setUTCHours(23, 59, 59, 999);

  let weekNumber = 1;
  while (current <= endNoon) {
    if (
      weekType === 'EVERY' ||
      (weekType === 'EVEN' && weekNumber % 2 === 0) ||
      (weekType === 'ODD' && weekNumber % 2 === 1)
    ) {
      dates.push(new Date(current));
    }
    current.setUTCDate(current.getUTCDate() + 7);
    weekNumber++;
  }
  return dates;
}

/** Domyslne daty semestru wg roku akademickiego i typu, gdy brak SemesterCalendar. */
export function deriveCalendarDates(academicYear: string, semesterType: SemesterType) {
  const firstYear = parseInt(academicYear.split('/')[0] ?? '2024');
  const secondYear = firstYear + 1;
  if (semesterType === 'WINTER') {
    return { startDate: new Date(`${firstYear}-10-01`), endDate: new Date(`${secondYear}-02-02`) };
  }
  return { startDate: new Date(`${secondYear}-02-17`), endDate: new Date(`${secondYear}-06-22`) };
}
