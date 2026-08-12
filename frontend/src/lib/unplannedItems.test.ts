import { describe, it, expect } from 'vitest';
import { computeUnplannedItems } from './unplannedItems';
import type { CurriculumEntry, ScheduleTemplate, StudentGroup, ClassType } from '@/types';

// Buildery — obiekty zawezone do pol, ktorych faktycznie uzywa computeUnplannedItems.
// Reszta pol nieistotna dla logiki backlogu, stad rzutowanie.
function entry(over: Partial<CurriculumEntry> & { id: string }): CurriculumEntry {
  return {
    subject: { id: `subj-${over.id}`, name: `Przedmiot ${over.id}`, code: null },
    instructor: null,
    hoursLecture: 0,
    hoursExercise: 0,
    hoursLab: 0,
    hoursProject: 0,
    hoursSeminar: 0,
    ...over,
  } as CurriculumEntry;
}

function group(id: string, type: ClassType): StudentGroup {
  return { id, name: id, type } as StudentGroup;
}

function template(
  entryId: string,
  classType: ClassType,
  groupId: string,
  startOrder: number,
  endOrder: number,
  weekType: 'EVERY' | 'EVEN' | 'ODD' = 'EVERY',
): ScheduleTemplate {
  return {
    curriculumEntryId: entryId,
    classType,
    studentGroup: { id: groupId },
    startBlock: { order: startOrder },
    endBlock: { order: endOrder },
    weekType,
  } as unknown as ScheduleTemplate;
}

describe('computeUnplannedItems', () => {
  it('pokazuje pozycje z niepokrytymi godzinami (30 h / 15 tyg. = 2 h/tydz.)', () => {
    const res = computeUnplannedItems({
      entries: [entry({ id: 'e1', hoursLecture: 30 })],
      groups: [group('g1', 'LECTURE')],
      templates: [],
      teachingWeeks: 15,
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.classType).toBe('LECTURE');
    expect(res.items[0]!.group.id).toBe('g1');
    expect(res.items[0]!.groupIsFallback).toBe(false);
  });

  it('nie pokazuje pozycji w pelni zaplanowanej (2 h wzorca pokrywa 2 h/tydz.)', () => {
    const res = computeUnplannedItems({
      entries: [entry({ id: 'e1', hoursLecture: 30 })],
      groups: [group('g1', 'LECTURE')],
      // blok 1..2 EVERY = span 2 = 2 h/tydz.
      templates: [template('e1', 'LECTURE', 'g1', 1, 2)],
      teachingWeeks: 15,
    });
    expect(res.items).toHaveLength(0);
  });

  it('zajecia co drugi tydzien (ODD) wnosza polowe godzin', () => {
    const res = computeUnplannedItems({
      entries: [entry({ id: 'e1', hoursLecture: 30 })], // 2 h/tydz.
      groups: [group('g1', 'LECTURE')],
      // blok 1..2 ODD = span 2 / 2 = 1 h/tydz. -> zostaje 1 h -> nadal do zaplanowania
      templates: [template('e1', 'LECTURE', 'g1', 1, 2, 'ODD')],
      teachingWeeks: 15,
    });
    expect(res.items).toHaveLength(1);
  });

  it('bez kalendarza (teachingWeeks=null): do zaplanowania tylko pozycje zupelnie puste', () => {
    const puste = computeUnplannedItems({
      entries: [entry({ id: 'e1', hoursLecture: 30 })],
      groups: [group('g1', 'LECTURE')],
      templates: [],
      teachingWeeks: null,
    });
    expect(puste.items).toHaveLength(1);

    const zWzorcem = computeUnplannedItems({
      entries: [entry({ id: 'e1', hoursLecture: 30 })],
      groups: [group('g1', 'LECTURE')],
      templates: [template('e1', 'LECTURE', 'g1', 1, 1)],
      teachingWeeks: null,
    });
    expect(zWzorcem.items).toHaveLength(0);
  });

  it('brak grupy danego typu (i zastepczej) trafia do missingGroupTypes, nie do items', () => {
    const res = computeUnplannedItems({
      entries: [entry({ id: 'e1', hoursLab: 30 })],
      groups: [group('g1', 'LECTURE')], // brak grupy LAB i brak fallbacku dla LAB
      templates: [],
      teachingWeeks: 15,
    });
    expect(res.items).toHaveLength(0);
    expect(res.missingGroupTypes).toContain('LAB');
  });

  it('seminarium bez grupy SEMINAR uzywa grupy zastepczej (fallback) z flaga', () => {
    const res = computeUnplannedItems({
      entries: [entry({ id: 'e1', hoursSeminar: 15 })],
      groups: [group('g1', 'EXERCISE')], // SEMINAR -> fallback EXERCISE
      templates: [],
      teachingWeeks: 15,
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.classType).toBe('SEMINAR');
    expect(res.items[0]!.groupIsFallback).toBe(true);
  });
});
