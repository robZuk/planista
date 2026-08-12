import { describe, it, expect } from 'vitest';
import { oppositeSemesterType, semesterTypeOf } from './semester';

// Lustro backend/src/lib/semester.ts — pilnuje spojnosci logiki front/back.

describe('oppositeSemesterType', () => {
  it('zamienia zime na lato i odwrotnie', () => {
    expect(oppositeSemesterType('WINTER')).toBe('SUMMER');
    expect(oppositeSemesterType('SUMMER')).toBe('WINTER');
  });
});

describe('semesterTypeOf', () => {
  it('start=WINTER: nieparzyste=zima, parzyste=lato', () => {
    expect(semesterTypeOf('WINTER', 1)).toBe('WINTER');
    expect(semesterTypeOf('WINTER', 2)).toBe('SUMMER');
    expect(semesterTypeOf('WINTER', 3)).toBe('WINTER');
  });

  it('nabor lutowy (start=SUMMER): semestr 1 jest LETNI', () => {
    expect(semesterTypeOf('SUMMER', 1)).toBe('SUMMER');
    expect(semesterTypeOf('SUMMER', 2)).toBe('WINTER');
  });
});
