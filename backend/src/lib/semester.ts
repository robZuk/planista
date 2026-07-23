import type { SemesterType } from '@prisma/client';

/**
 * Logika typu semestru (zimowy/letni) niezalezna od zaszytego zalozenia
 * "nieparzysty = zima". Typ wyliczamy naprzemiennie od semestru startowego programu
 * (CurriculumVersion.startSemesterType), dzieki czemu obslugujemy tez nabor lutowy.
 */

/** Zwraca przeciwny typ semestru. */
export function oppositeSemesterType(type: SemesterType): SemesterType {
  return type === 'WINTER' ? 'SUMMER' : 'WINTER';
}

/**
 * Typ semestru o numerze `semester` (1-based) dla programu startujacego od `startType`.
 *
 * Zasada: semestr nieparzysty ma taki sam typ jak start, parzysty — przeciwny.
 *   start=WINTER: 1→WINTER, 2→SUMMER, 3→WINTER, 4→SUMMER ...
 *   start=SUMMER: 1→SUMMER, 2→WINTER, 3→SUMMER, 4→WINTER ...
 */
export function semesterTypeOf(startType: SemesterType, semester: number): SemesterType {
  if (!Number.isInteger(semester) || semester < 1) {
    throw new Error(`Nieprawidlowy numer semestru: ${semester}`);
  }
  const isOdd = semester % 2 === 1;
  return isOdd ? startType : oppositeSemesterType(startType);
}

/**
 * Numery semestrow (1..totalSemesters) nalezace do danego typu, dla programu
 * startujacego od `startType`. Odwrotnosc semesterTypeOf — przyda sie w filtrach UI
 * (globalny kontekst rok/semestr).
 *   start=WINTER, total=7: WINTER→[1,3,5,7], SUMMER→[2,4,6]
 *   start=SUMMER, total=7: SUMMER→[1,3,5,7], WINTER→[2,4,6]
 */
export function semesterNumbersOfType(
  startType: SemesterType,
  targetType: SemesterType,
  totalSemesters: number,
): number[] {
  const result: number[] = [];
  for (let s = 1; s <= totalSemesters; s++) {
    if (semesterTypeOf(startType, s) === targetType) result.push(s);
  }
  return result;
}
