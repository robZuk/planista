import { describe, it, expect } from 'vitest';
import {
  rangesOverlap,
  compatibleWeekTypes,
  isDayAllowedForMode,
  checkTimeWindow,
  isInStudyModeWindow,
  getDatesForDayOfWeek,
  deriveCalendarDates,
} from './scheduleTime';

// Czas w planie = bloki 1-godzinne (order). Konflikt = nakladanie zakresow order.

describe('rangesOverlap', () => {
  it('wykrywa nakladanie i stycznosc (przedzialy domkniete)', () => {
    expect(rangesOverlap(1, 2, 2, 3)).toBe(true); // stycznosc w punkcie 2
    expect(rangesOverlap(1, 3, 2, 2)).toBe(true); // zawieranie
    expect(rangesOverlap(1, 2, 3, 4)).toBe(false); // rozlaczne
    expect(rangesOverlap(3, 4, 1, 2)).toBe(false); // rozlaczne (odwrotna kolejnosc)
  });
});

describe('compatibleWeekTypes', () => {
  it('EVEN i ODD nie koliduja ze soba', () => {
    expect(compatibleWeekTypes('EVEN')).toEqual(['ODD']);
    expect(compatibleWeekTypes('ODD')).toEqual(['EVEN']);
  });
  it('EVERY koliduje ze wszystkim (brak kompatybilnych)', () => {
    expect(compatibleWeekTypes('EVERY')).toEqual([]);
  });
});

describe('isDayAllowedForMode', () => {
  it('FULL_TIME: pon-pt (1..5)', () => {
    expect(isDayAllowedForMode(1, 'FULL_TIME')).toBe(true);
    expect(isDayAllowedForMode(5, 'FULL_TIME')).toBe(true);
    expect(isDayAllowedForMode(6, 'FULL_TIME')).toBe(false);
    expect(isDayAllowedForMode(0, 'FULL_TIME')).toBe(false);
  });
  it('PART_TIME: pt/sob/nd (5,6,0)', () => {
    expect(isDayAllowedForMode(5, 'PART_TIME')).toBe(true);
    expect(isDayAllowedForMode(6, 'PART_TIME')).toBe(true);
    expect(isDayAllowedForMode(0, 'PART_TIME')).toBe(true);
    expect(isDayAllowedForMode(3, 'PART_TIME')).toBe(false);
  });
});

describe('checkTimeWindow', () => {
  it('FULL_TIME odrzuca weekend, przepuszcza dni robocze', () => {
    expect(checkTimeWindow(3, '08:00', 'FULL_TIME')).toBeNull();
    expect(checkTimeWindow(6, '08:00', 'FULL_TIME')).toMatch(/stacjonarne/);
  });
  it('PART_TIME odrzuca pon-czw', () => {
    expect(checkTimeWindow(2, '08:00', 'PART_TIME')).toMatch(/pt\/sob\/nd/);
  });
  it('PART_TIME: piatek dozwolony dopiero od 15:00', () => {
    expect(checkTimeWindow(5, '14:59', 'PART_TIME')).toMatch(/piatek dopiero/);
    expect(checkTimeWindow(5, '15:00', 'PART_TIME')).toBeNull();
    expect(checkTimeWindow(6, '08:00', 'PART_TIME')).toBeNull();
  });
});

describe('isInStudyModeWindow', () => {
  it('liczy dzien z UTC, nie z lokalnej strefy', () => {
    // 2025-10-01 to sroda (UTC day = 3)
    const wed = new Date('2025-10-01T12:00:00Z');
    expect(isInStudyModeWindow(wed, 'FULL_TIME', '08:00')).toBe(true);
    expect(isInStudyModeWindow(wed, 'PART_TIME', '08:00')).toBe(false);
  });
  it('PART_TIME: piatek tylko od 15:00', () => {
    const fri = new Date('2025-10-03T12:00:00Z'); // piatek
    expect(isInStudyModeWindow(fri, 'PART_TIME', '14:00')).toBe(false);
    expect(isInStudyModeWindow(fri, 'PART_TIME', '15:00')).toBe(true);
  });
});

describe('getDatesForDayOfWeek', () => {
  it('EVERY: wszystkie srody w zakresie, o poludniu UTC', () => {
    const start = new Date('2025-10-01'); // sroda
    const end = new Date('2025-10-22');
    const dates = getDatesForDayOfWeek(start, end, 'WEDNESDAY', 'EVERY');
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2025-10-01',
      '2025-10-08',
      '2025-10-15',
      '2025-10-22',
    ]);
    // poludnie UTC — odpornosc na DST
    expect(dates[0]!.getUTCHours()).toBe(12);
  });

  it('ODD bierze tygodnie 1 i 3, EVEN tygodnie 2 i 4', () => {
    const start = new Date('2025-10-01');
    const end = new Date('2025-10-22');
    const odd = getDatesForDayOfWeek(start, end, 'WEDNESDAY', 'ODD');
    const even = getDatesForDayOfWeek(start, end, 'WEDNESDAY', 'EVEN');
    expect(odd.map((d) => d.toISOString().slice(0, 10))).toEqual(['2025-10-01', '2025-10-15']);
    expect(even.map((d) => d.toISOString().slice(0, 10))).toEqual(['2025-10-08', '2025-10-22']);
  });

  it('gdy start nie jest szukanym dniem, przeskakuje do pierwszego wystapienia', () => {
    const start = new Date('2025-10-01'); // sroda
    const end = new Date('2025-10-10');
    const dates = getDatesForDayOfWeek(start, end, 'FRIDAY', 'EVERY');
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2025-10-03', '2025-10-10']);
  });
});

describe('deriveCalendarDates', () => {
  it('WINTER: 1.10 pierwszego roku do 2.02 nastepnego', () => {
    const { startDate, endDate } = deriveCalendarDates('2024/2025', 'WINTER');
    expect(startDate.toISOString().slice(0, 10)).toBe('2024-10-01');
    expect(endDate.toISOString().slice(0, 10)).toBe('2025-02-02');
  });
  it('SUMMER: luty-czerwiec drugiego roku', () => {
    const { startDate, endDate } = deriveCalendarDates('2024/2025', 'SUMMER');
    expect(startDate.toISOString().slice(0, 10)).toBe('2025-02-17');
    expect(endDate.toISOString().slice(0, 10)).toBe('2025-06-22');
  });
});
