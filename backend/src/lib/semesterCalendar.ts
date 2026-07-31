import type { SemesterType, StudyMode } from '@prisma/client';
import { prisma } from './prisma';
import { deriveCalendarDates } from './scheduleTime';

/** Skad wzielismy zakres dat semestru — pokazywane w UI przed generowaniem. */
export type SemesterRangeSource = 'FACULTY' | 'DERIVED';

export interface SemesterRange {
  startDate: Date;
  endDate: Date;
  teachingWeeks: number | null;
  source: SemesterRangeSource;
}

/**
 * Zakres dat semestru dla wydzialu. Kalendarz zawsze nalezy do wydzialu, wiec albo
 * wydzial ma swoj wpis, albo wracamy do dat wyliczonych z roku akademickiego.
 *
 * Wczesniej byl tu jeszcze poziom posredni — kalendarz ogolnouczelniany (facultyId
 * = null) jako fallback. Zniknal razem z samym wariantem: definiowal zasieg przez
 * brak i psul unique na kluczu kalendarza. Wspolne daty dla calej uczelni zaklada
 * sie teraz hurtem, po wierszu na wydzial.
 */
export async function resolveSemesterRange(
  academicYear: string,
  semesterType: SemesterType,
  studyMode: StudyMode,
  facultyId: string,
): Promise<SemesterRange> {
  const own = await prisma.semesterCalendar.findFirst({
    where: { academicYear, semesterType, studyMode, facultyId },
  });
  if (own) {
    return {
      startDate: own.startDate,
      endDate: own.endDate,
      teachingWeeks: own.teachingWeeks,
      source: 'FACULTY',
    };
  }

  const derived = deriveCalendarDates(academicYear, semesterType);
  return { ...derived, teachingWeeks: null, source: 'DERIVED' };
}
