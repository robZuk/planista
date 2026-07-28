import type { SemesterType, StudyMode } from '@prisma/client';
import { prisma } from './prisma';
import { deriveCalendarDates } from './scheduleTime';

/** Skad wzielismy zakres dat semestru — pokazywane w UI przed generowaniem. */
export type SemesterRangeSource = 'FACULTY' | 'GLOBAL' | 'DERIVED';

export interface SemesterRange {
  startDate: Date;
  endDate: Date;
  teachingWeeks: number | null;
  source: SemesterRangeSource;
}

/**
 * Zakres dat semestru dla wydzialu. Kalendarz wydzialowy ma pierwszenstwo,
 * ogolnouczelniany (facultyId = null) jest fallbackiem, a gdy nie ma zadnego —
 * wracamy do dat wyliczonych z roku akademickiego.
 */
export async function resolveSemesterRange(
  academicYear: string,
  semesterType: SemesterType,
  studyMode: StudyMode,
  facultyId: string | null,
): Promise<SemesterRange> {
  const base = { academicYear, semesterType, studyMode };

  if (facultyId) {
    const own = await prisma.semesterCalendar.findFirst({ where: { ...base, facultyId } });
    if (own) {
      return { startDate: own.startDate, endDate: own.endDate, teachingWeeks: own.teachingWeeks, source: 'FACULTY' };
    }
  }

  const global = await prisma.semesterCalendar.findFirst({ where: { ...base, facultyId: null } });
  if (global) {
    return { startDate: global.startDate, endDate: global.endDate, teachingWeeks: global.teachingWeeks, source: 'GLOBAL' };
  }

  const derived = deriveCalendarDates(academicYear, semesterType);
  return { ...derived, teachingWeeks: null, source: 'DERIVED' };
}
