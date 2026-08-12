import { describe, it, expect } from 'vitest';
import {
  oppositeSemesterType,
  semesterTypeOf,
  semesterNumbersOfType,
} from './semester';

// Typ semestru liczony naprzemiennie od semestru startowego programu — NIE z
// parzystosci numeru. Kluczowe dla naboru lutowego (start=SUMMER).

describe('oppositeSemesterType', () => {
  it('zamienia zime na lato i odwrotnie', () => {
    expect(oppositeSemesterType('WINTER')).toBe('SUMMER');
    expect(oppositeSemesterType('SUMMER')).toBe('WINTER');
  });
});

describe('semesterTypeOf', () => {
  it('nabor pazdziernikowy (start=WINTER): nieparzyste=zima, parzyste=lato', () => {
    expect(semesterTypeOf('WINTER', 1)).toBe('WINTER');
    expect(semesterTypeOf('WINTER', 2)).toBe('SUMMER');
    expect(semesterTypeOf('WINTER', 3)).toBe('WINTER');
    expect(semesterTypeOf('WINTER', 4)).toBe('SUMMER');
  });

  it('nabor lutowy (start=SUMMER): semestr 1 jest LETNI', () => {
    expect(semesterTypeOf('SUMMER', 1)).toBe('SUMMER');
    expect(semesterTypeOf('SUMMER', 2)).toBe('WINTER');
    expect(semesterTypeOf('SUMMER', 3)).toBe('SUMMER');
  });

  it('odrzuca nieprawidlowy numer semestru', () => {
    expect(() => semesterTypeOf('WINTER', 0)).toThrow();
    expect(() => semesterTypeOf('WINTER', -1)).toThrow();
    expect(() => semesterTypeOf('WINTER', 1.5)).toThrow();
  });
});

describe('semesterNumbersOfType', () => {
  it('start=WINTER, total=7: zima=[1,3,5,7], lato=[2,4,6]', () => {
    expect(semesterNumbersOfType('WINTER', 'WINTER', 7)).toEqual([1, 3, 5, 7]);
    expect(semesterNumbersOfType('WINTER', 'SUMMER', 7)).toEqual([2, 4, 6]);
  });

  it('start=SUMMER, total=7: lato=[1,3,5,7], zima=[2,4,6]', () => {
    expect(semesterNumbersOfType('SUMMER', 'SUMMER', 7)).toEqual([1, 3, 5, 7]);
    expect(semesterNumbersOfType('SUMMER', 'WINTER', 7)).toEqual([2, 4, 6]);
  });

  it('pusta lista gdy brak semestrow', () => {
    expect(semesterNumbersOfType('WINTER', 'WINTER', 0)).toEqual([]);
  });
});
