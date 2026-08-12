import { describe, it, expect } from 'vitest';
import {
  FULL_SCOPE,
  isScoped,
  scopePayload,
  templateScopeParams,
  describeScope,
  type PlanScope,
} from './planScope';

const scope = (over: Partial<PlanScope> = {}): PlanScope => ({ ...FULL_SCOPE, ...over });

describe('isScoped', () => {
  it('FULL_SCOPE nie jest zawezony', () => {
    expect(isScoped(FULL_SCOPE)).toBe(false);
  });
  it('dowolne pole != all zaweza', () => {
    expect(isScoped(scope({ semester: 3 }))).toBe(true);
    expect(isScoped(scope({ fieldOfStudyId: 'f1' }))).toBe(true);
  });
});

describe('scopePayload', () => {
  it('pomija pola all, przekazuje ustawione', () => {
    expect(scopePayload(FULL_SCOPE)).toEqual({});
    expect(scopePayload(scope({ fieldOfStudyId: 'f1', semester: 3 }))).toEqual({
      fieldOfStudyId: 'f1',
      semester: 3,
    });
  });
});

describe('templateScopeParams', () => {
  it('specjalnosc wygrywa nad kierunkiem (jest wezsza)', () => {
    expect(templateScopeParams(scope({ fieldOfStudyId: 'f1', specializationId: 's1' }))).toEqual({
      specializationId: 's1',
    });
  });
  it('sam kierunek gdy brak specjalnosci; semestr filtrowany po stronie klienta', () => {
    expect(templateScopeParams(scope({ fieldOfStudyId: 'f1', semester: 3 }))).toEqual({
      fieldOfStudyId: 'f1',
    });
    expect(templateScopeParams(FULL_SCOPE)).toEqual({});
  });
});

describe('describeScope', () => {
  it('specjalnosc + semestr', () => {
    const s = scope({ fieldOfStudyId: 'f1', specializationId: 's1', semester: 3 });
    expect(describeScope(s, { fieldName: 'Informatyka', specializationName: 'Diagnostyka' })).toBe(
      'Diagnostyka · semestr 3',
    );
  });
  it('sam kierunek gdy brak specjalnosci', () => {
    expect(describeScope(scope({ fieldOfStudyId: 'f1' }), { fieldName: 'Informatyka' })).toBe(
      'Informatyka',
    );
  });
  it('brak zawezenia = caly wydzial', () => {
    expect(describeScope(FULL_SCOPE, {})).toBe('caly wydzial');
  });
});
