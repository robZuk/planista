import type { SemesterType } from '@/types';

/**
 * Lustrzane odbicie backend/src/lib/semester.ts — typ semestru wyliczany
 * naprzemiennie od semestru startowego programu (CurriculumVersion.startSemesterType),
 * a NIE zaszyty na sztywno jako "nieparzysty = zima" (patrz docs/model-danych.md).
 * Dzieki temu obslugujemy tez nabor lutowy.
 */

export function oppositeSemesterType(type: SemesterType): SemesterType {
  return type === 'WINTER' ? 'SUMMER' : 'WINTER';
}

export function semesterTypeOf(startType: SemesterType, semester: number): SemesterType {
  const isOdd = semester % 2 === 1;
  return isOdd ? startType : oppositeSemesterType(startType);
}

export const SEMESTER_TYPE_LABELS: Record<SemesterType, string> = {
  WINTER: 'Zimowy',
  SUMMER: 'Letni',
};
