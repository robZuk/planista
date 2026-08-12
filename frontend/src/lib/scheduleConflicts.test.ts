import { describe, it, expect } from 'vitest';
import {
  rangesOverlap,
  isTimeWindowOk,
  weekTypesConflict,
  getGroupFamilyIds,
} from './scheduleConflicts';

describe('rangesOverlap', () => {
  it('stycznosc i zawieranie = konflikt, rozlaczne = brak', () => {
    expect(rangesOverlap(1, 2, 2, 3)).toBe(true);
    expect(rangesOverlap(1, 3, 2, 2)).toBe(true);
    expect(rangesOverlap(1, 2, 3, 4)).toBe(false);
  });
});

describe('isTimeWindowOk', () => {
  it('FULL_TIME dozwolone pon-pt', () => {
    expect(isTimeWindowOk(3, '08:00', 'FULL_TIME')).toBe(true);
    expect(isTimeWindowOk(6, '08:00', 'FULL_TIME')).toBe(false);
  });
  it('PART_TIME: pt od 15:00, sob/nd caly dzien, pon-czw nie', () => {
    expect(isTimeWindowOk(2, '10:00', 'PART_TIME')).toBe(false);
    expect(isTimeWindowOk(5, '14:59', 'PART_TIME')).toBe(false);
    expect(isTimeWindowOk(5, '15:00', 'PART_TIME')).toBe(true);
    expect(isTimeWindowOk(6, '08:00', 'PART_TIME')).toBe(true);
    expect(isTimeWindowOk(0, '08:00', 'PART_TIME')).toBe(true);
  });
});

describe('weekTypesConflict', () => {
  it('EVERY koliduje ze wszystkim', () => {
    expect(weekTypesConflict('EVERY', 'ODD')).toBe(true);
    expect(weekTypesConflict('EVEN', 'EVERY')).toBe(true);
  });
  it('EVEN i ODD nie koliduja; ten sam typ koliduje', () => {
    expect(weekTypesConflict('EVEN', 'ODD')).toBe(false);
    expect(weekTypesConflict('ODD', 'ODD')).toBe(true);
  });
});

describe('getGroupFamilyIds', () => {
  // W: rodzic (wyklad) -> C1, C2 (cwiczenia); C1 -> L1 (lab).
  const groups = [
    { id: 'W', parentGroupId: null },
    { id: 'C1', parentGroupId: 'W' },
    { id: 'C2', parentGroupId: 'W' },
    { id: 'L1', parentGroupId: 'C1' },
  ];

  it('dla C1 zwraca przodkow (W) i potomkow (L1), bez rodzenstwa C2', () => {
    const fam = getGroupFamilyIds('C1', groups);
    expect(fam.sort()).toEqual(['C1', 'L1', 'W']);
    expect(fam).not.toContain('C2');
  });

  it('dla korzenia W zwraca cale poddrzewo', () => {
    expect(getGroupFamilyIds('W', groups).sort()).toEqual(['C1', 'C2', 'L1', 'W']);
  });

  it('dla liscia L1 idzie w gore lancucha', () => {
    expect(getGroupFamilyIds('L1', groups).sort()).toEqual(['C1', 'L1', 'W']);
  });
});
