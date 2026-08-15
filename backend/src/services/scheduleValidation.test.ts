import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mocki warstwy danych ─────────────────────────────────────────────
// Prisma i getGroupFamilyIds sa mockowane, dzieki czemu walidacje testujemy
// bez bazy. Kazdy test ustawia wlasne zwracane wartosci (mockResolvedValue).
vi.mock('../lib/prisma', () => ({
  prisma: {
    timeBlock: { findUnique: vi.fn() },
    room: { findUnique: vi.fn() },
    studentGroup: { findUnique: vi.fn() },
    curriculumEntry: { findUnique: vi.fn() },
    scheduleEntry: { findMany: vi.fn() },
    scheduleTemplate: { findMany: vi.fn() },
  },
}));

vi.mock('../lib/groupFamily', () => ({
  // Domyslnie rodzina = sama grupa; test moze nadpisac.
  getGroupFamilyIds: vi.fn(async (id: string) => [id]),
}));

import { prisma } from '../lib/prisma';
import { getGroupFamilyIds } from '../lib/groupFamily';
import {
  isBadRequestError,
  checkRoomType,
  plannedHours,
  validateEntry,
  validateTemplate,
  type ValidationError,
  type EntryValidationDto,
  type TemplateValidationDto,
} from './scheduleValidation';

// Typowany uchwyt do zamockowanej Prismy (deep) — .mockResolvedValue itd.
const db = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

// Dwa sasiadujace bloki: b1 (order 1) i b2 (order 2). Zajecie b1..b2 = 2 godziny.
function mockBlocks() {
  db.timeBlock.findUnique.mockImplementation((args: { where: { id: string } }) => {
    const map: Record<string, unknown> = {
      b1: { id: 'b1', order: 1, startTime: '08:00', endTime: '08:45' },
      b2: { id: 'b2', order: 2, startTime: '08:55', endTime: '09:40' },
    };
    return Promise.resolve((map[args.where.id] ?? null) as never);
  });
}

const baseEntryDto: EntryValidationDto = {
  date: new Date('2025-10-01T12:00:00Z'), // sroda — poza oknem PART_TIME, ok dla FULL_TIME
  roomId: 'room-1',
  instructorId: 'instr-1',
  studentGroupId: null,
  startBlockId: 'b1',
  endBlockId: 'b2',
  classType: 'LECTURE',
};

// ═══════════════════════════════════════════════════════════════
//  Funkcje czyste (bez bazy) — pelne pokrycie
// ═══════════════════════════════════════════════════════════════

describe('isBadRequestError', () => {
  it('zwraca true dla bledow danych (400)', () => {
    const codes: ValidationError['code'][] = ['WRONG_ROOM_TYPE', 'TIME_WINDOW_VIOLATION', 'BAD_BLOCK_RANGE'];
    for (const code of codes) {
      expect(isBadRequestError({ code } as ValidationError)).toBe(true);
    }
  });

  it('zwraca false dla konfliktow i limitow (409)', () => {
    const codes: ValidationError['code'][] = [
      'ROOM_CONFLICT',
      'INSTRUCTOR_CONFLICT',
      'GROUP_CONFLICT',
      'INSUFFICIENT_ROOM_CAPACITY',
      'HOURS_EXCEEDED',
    ];
    for (const code of codes) {
      expect(isBadRequestError({ code } as ValidationError)).toBe(false);
    }
  });
});

describe('checkRoomType', () => {
  it('przepuszcza sale zgodna z typem zajec', () => {
    expect(checkRoomType('LECTURE', 'LECTURE')).toBeNull();
    expect(checkRoomType('EXERCISE', 'SPORTS')).toBeNull(); // WF w sali sportowej
    expect(checkRoomType('LAB', 'COMPUTER_LAB')).toBeNull();
  });

  it('odrzuca niezgodny typ sali z lista dozwolonych', () => {
    const err = checkRoomType('LAB', 'LECTURE');
    expect(err).toMatchObject({ code: 'WRONG_ROOM_TYPE', details: { roomType: 'LECTURE', classType: 'LAB' } });
    expect(err?.code === 'WRONG_ROOM_TYPE' && err.details.allowed).toEqual(['LAB', 'COMPUTER_LAB']);
  });
});

// ═══════════════════════════════════════════════════════════════
//  plannedHours — sumowanie godzin z blokow (mock scheduleEntry)
// ═══════════════════════════════════════════════════════════════

describe('plannedHours', () => {
  it('sumuje godziny jako (endOrder - startOrder + 1) po wpisach', async () => {
    db.scheduleEntry.findMany.mockResolvedValue([
      { startBlock: { order: 1 }, endBlock: { order: 2 } }, // 2h
      { startBlock: { order: 5 }, endBlock: { order: 5 } }, // 1h
    ] as never);
    await expect(plannedHours('ce-1', 'LECTURE', null)).resolves.toBe(3);
  });

  it('zwraca 0 gdy brak zaplanowanych wpisow', async () => {
    db.scheduleEntry.findMany.mockResolvedValue([] as never);
    await expect(plannedHours('ce-1', 'LECTURE', null)).resolves.toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
//  validateEntry — walidacja konkretnego terminu
// ═══════════════════════════════════════════════════════════════

describe('validateEntry', () => {
  it('BAD_BLOCK_RANGE gdy blok czasowy nie istnieje', async () => {
    db.timeBlock.findUnique.mockResolvedValue(null as never);
    const err = await validateEntry(baseEntryDto);
    expect(err).toEqual({ code: 'BAD_BLOCK_RANGE', details: { message: 'Blok czasowy nie istnieje' } });
  });

  it('HOURS_EXCEEDED gdy przekroczono limit godzin z siatki', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never); // pomijamy walidacje sali
    db.curriculumEntry.findUnique.mockResolvedValue({
      hoursLecture: 1, // limit 1h, a zajecie zajmuje 2h
      hoursExercise: 0,
      hoursLab: 0,
      hoursProject: 0,
      hoursSeminar: 0,
    } as never);
    db.scheduleEntry.findMany.mockResolvedValue([] as never); // 0h juz zaplanowane

    const err = await validateEntry({ ...baseEntryDto, curriculumEntryId: 'ce-1' });
    expect(err).toMatchObject({
      code: 'HOURS_EXCEEDED',
      details: { classType: 'LECTURE', limit: 1, alreadyPlanned: 0, requested: 2, remaining: 1 },
    });
  });

  it('WRONG_ROOM_TYPE gdy typ sali niezgodny', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue({ type: 'LAB', capacity: 100 } as never); // LAB dla LECTURE = zle
    const err = await validateEntry(baseEntryDto);
    expect(err).toMatchObject({ code: 'WRONG_ROOM_TYPE', details: { roomType: 'LAB', classType: 'LECTURE' } });
  });

  it('TIME_WINDOW_VIOLATION gdy PART_TIME w srode (poza oknem pt/sob/nd)', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never); // pomijamy walidacje sali
    const err = await validateEntry({ ...baseEntryDto, studyMode: 'PART_TIME' }); // data to sroda
    expect(err).toMatchObject({ code: 'TIME_WINDOW_VIOLATION' });
  });

  it('ROOM_CONFLICT gdy inny wpis tej daty zajmuje ta sale w nachodzacym zakresie', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never);
    db.scheduleEntry.findMany.mockResolvedValue([] as never);
    db.scheduleEntry.findMany.mockResolvedValueOnce([
      {
        id: 'e-room',
        date: new Date('2025-10-01T12:00:00Z'),
        startBlock: { order: 2, startTime: '08:55' }, // 2..3 nachodzi na 1..2
        endBlock: { order: 3, endTime: '10:30' },
        room: { number: 'A1', building: { name: 'Bud A' } },
      },
    ] as never);
    const err = await validateEntry(baseEntryDto);
    expect(err).toMatchObject({ code: 'ROOM_CONFLICT', details: { conflictId: 'e-room' } });
  });

  it('INSTRUCTOR_CONFLICT gdy prowadzacy ma inny wpis w nachodzacym zakresie', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never);
    db.scheduleEntry.findMany.mockResolvedValue([] as never);
    db.scheduleEntry.findMany
      .mockResolvedValueOnce([] as never) // sala: brak
      .mockResolvedValueOnce([
        {
          id: 'e-instr',
          date: new Date('2025-10-01T12:00:00Z'),
          startBlock: { order: 1, startTime: '08:00' },
          endBlock: { order: 2, endTime: '09:40' },
          instructor: { firstName: 'Jan', lastName: 'Kowalski', title: 'dr' },
        },
      ] as never);
    const err = await validateEntry(baseEntryDto);
    expect(err).toMatchObject({ code: 'INSTRUCTOR_CONFLICT', details: { conflictId: 'e-instr' } });
  });

  it('GROUP_CONFLICT gdy grupa (cala rodzina) ma juz wpis w nachodzacym zakresie', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never);
    db.scheduleEntry.findMany.mockResolvedValue([] as never);
    db.scheduleEntry.findMany
      .mockResolvedValueOnce([] as never) // sala
      .mockResolvedValueOnce([] as never) // prowadzacy
      .mockResolvedValueOnce([
        {
          id: 'e-group',
          date: new Date('2025-10-01T12:00:00Z'),
          startBlock: { order: 1, startTime: '08:00' },
          endBlock: { order: 2, endTime: '09:40' },
          studentGroup: { name: 'DUT-1-W' },
        },
      ] as never);
    const err = await validateEntry({ ...baseEntryDto, studentGroupId: 'g1' });
    expect(err).toMatchObject({ code: 'GROUP_CONFLICT', details: { conflictId: 'e-group', label: 'DUT-1-W' } });
  });

  it('INSUFFICIENT_ROOM_CAPACITY gdy pojemnosc sali < rozmiar grupy', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue({ type: 'LECTURE', capacity: 10 } as never); // typ ok
    db.scheduleEntry.findMany.mockResolvedValue([] as never); // brak konfliktow czasowych
    db.studentGroup.findUnique.mockResolvedValue({ size: 30 } as never); // grupa wieksza niz sala
    const err = await validateEntry({ ...baseEntryDto, studentGroupId: 'g1' });
    expect(err).toMatchObject({ code: 'INSUFFICIENT_ROOM_CAPACITY', details: { roomCapacity: 10, groupSize: 30 } });
  });

  it('zwraca null gdy wszystko sie zgadza (brak konfliktow)', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue({ type: 'LECTURE', capacity: 100 } as never);
    db.scheduleEntry.findMany.mockResolvedValue([] as never);
    await expect(validateEntry(baseEntryDto)).resolves.toBeNull();
  });

  it('excludeId pomija wskazany wpis (zapytania o konflikty go wykluczaja)', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never);
    db.scheduleEntry.findMany.mockResolvedValue([] as never);
    await validateEntry({ ...baseEntryDto, excludeId: 'self-1' });
    expect(db.scheduleEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 'self-1' } }) }),
    );
  });

  it('CANCELLED wpisy nie licza sie jako konflikt (where status != CANCELLED)', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never);
    db.scheduleEntry.findMany.mockResolvedValue([] as never);
    await validateEntry(baseEntryDto);
    expect(db.scheduleEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'CANCELLED' } }) }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
//  validateTemplate — walidacja wzorca tygodnia (konflikty miedzy wzorcami)
// ═══════════════════════════════════════════════════════════════

describe('validateTemplate', () => {
  const baseTemplateDto: TemplateValidationDto = {
    classType: 'LECTURE',
    roomId: 'room-1',
    instructorId: 'instr-1',
    studentGroupId: null,
    dayOfWeek: 'MONDAY',
    startBlockId: 'b1',
    endBlockId: 'b2',
    academicYear: '2025/2026',
    semester: 1,
    curriculumEntryId: 'ce-1',
    weekType: 'EVERY',
    studyMode: 'FULL_TIME',
  };

  it('BAD_BLOCK_RANGE gdy blok koncowy jest wczesniejszy niz poczatkowy', async () => {
    db.timeBlock.findUnique.mockImplementation((args: { where: { id: string } }) => {
      const map: Record<string, unknown> = {
        b1: { id: 'b1', order: 5, startTime: '12:00', endTime: '12:45' },
        b2: { id: 'b2', order: 2, startTime: '08:55', endTime: '09:40' },
      };
      return Promise.resolve((map[args.where.id] ?? null) as never);
    });
    const err = await validateTemplate(baseTemplateDto);
    expect(err).toEqual({ code: 'BAD_BLOCK_RANGE', details: { message: 'Blok koncowy jest wczesniejszy niz poczatkowy' } });
  });

  // Kluczowe: `sameSemesterType` — koliduja tylko wzorce tego samego typu semestru
  // (zimowy/letni), liczonego z siatki KAZDEGO wzorca (semesterTypeOf).

  it('TIME_WINDOW_VIOLATION gdy FULL_TIME w sobote', async () => {
    mockBlocks();
    const err = await validateTemplate({ ...baseTemplateDto, dayOfWeek: 'SATURDAY' });
    expect(err).toMatchObject({ code: 'TIME_WINDOW_VIOLATION' });
  });

  it('ROOM_CONFLICT z innym wzorcem tego samego typu semestru i nachodzacym zakresem', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue({ type: 'LECTURE', capacity: 100 } as never);
    db.curriculumEntry.findUnique.mockResolvedValue({ curriculumVersion: { startSemesterType: 'WINTER' } } as never);
    db.scheduleTemplate.findMany.mockResolvedValue([] as never);
    db.scheduleTemplate.findMany.mockResolvedValueOnce([
      {
        id: 't-room',
        dayOfWeek: 'MONDAY',
        semester: 1,
        curriculumEntry: { curriculumVersion: { startSemesterType: 'WINTER' } }, // ta sama pora roku
        startBlock: { order: 2, startTime: '08:55' }, // 2..3 nachodzi na 1..2
        endBlock: { order: 3, endTime: '10:30' },
        room: { number: 'A1', building: { name: 'Bud A' } },
      },
    ] as never);
    const err = await validateTemplate(baseTemplateDto);
    expect(err).toMatchObject({ code: 'ROOM_CONFLICT', details: { conflictId: 't-room' } });
  });

  it('brak ROOM_CONFLICT gdy kandydat jest z przeciwnego typu semestru (zima vs lato)', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never);
    db.curriculumEntry.findUnique.mockResolvedValue({ curriculumVersion: { startSemesterType: 'WINTER' } } as never); // wlasny = zima
    db.scheduleTemplate.findMany.mockResolvedValue([] as never);
    db.scheduleTemplate.findMany.mockResolvedValueOnce([
      {
        id: 't-summer',
        dayOfWeek: 'MONDAY',
        semester: 1,
        curriculumEntry: { curriculumVersion: { startSemesterType: 'SUMMER' } }, // semestr 1 od lata = LATO
        startBlock: { order: 1, startTime: '08:00' },
        endBlock: { order: 2, endTime: '09:40' },
        room: { number: 'A1', building: { name: 'Bud A' } },
      },
    ] as never);
    await expect(validateTemplate(baseTemplateDto)).resolves.toBeNull();
  });

  it('INSTRUCTOR_CONFLICT z innym wzorcem prowadzacego', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never);
    db.curriculumEntry.findUnique.mockResolvedValue({ curriculumVersion: { startSemesterType: 'WINTER' } } as never);
    db.scheduleTemplate.findMany.mockResolvedValue([] as never);
    db.scheduleTemplate.findMany
      .mockResolvedValueOnce([] as never) // sala
      .mockResolvedValueOnce([
        {
          id: 't-instr',
          dayOfWeek: 'MONDAY',
          semester: 1,
          curriculumEntry: { curriculumVersion: { startSemesterType: 'WINTER' } },
          startBlock: { order: 1, startTime: '08:00' },
          endBlock: { order: 2, endTime: '09:40' },
          instructor: { firstName: 'Jan', lastName: 'Kowalski', title: 'dr' },
        },
      ] as never);
    const err = await validateTemplate(baseTemplateDto);
    expect(err).toMatchObject({ code: 'INSTRUCTOR_CONFLICT', details: { conflictId: 't-instr' } });
  });

  it('GROUP_CONFLICT obejmuje cala rodzine grup (getGroupFamilyIds)', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue({ type: 'LECTURE', capacity: 100 } as never);
    db.studentGroup.findUnique.mockResolvedValue({ size: 30 } as never); // < capacity -> brak INSUFFICIENT
    db.curriculumEntry.findUnique.mockResolvedValue({ curriculumVersion: { startSemesterType: 'WINTER' } } as never);
    vi.mocked(getGroupFamilyIds).mockResolvedValue(['g1', 'g2', 'g3']);
    db.scheduleTemplate.findMany.mockResolvedValue([] as never);
    db.scheduleTemplate.findMany
      .mockResolvedValueOnce([] as never) // sala
      .mockResolvedValueOnce([] as never) // prowadzacy
      .mockResolvedValueOnce([
        {
          id: 't-group',
          dayOfWeek: 'MONDAY',
          semester: 1,
          curriculumEntry: { curriculumVersion: { startSemesterType: 'WINTER' } },
          startBlock: { order: 1, startTime: '08:00' },
          endBlock: { order: 2, endTime: '09:40' },
          studentGroup: { name: 'DUT-1-C-A' },
        },
      ] as never);
    const err = await validateTemplate({ ...baseTemplateDto, studentGroupId: 'g1' });
    expect(err).toMatchObject({ code: 'GROUP_CONFLICT', details: { conflictId: 't-group' } });
    expect(db.scheduleTemplate.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentGroupId: { in: ['g1', 'g2', 'g3'] } }) }),
    );
  });

  it('weekType EVEN wyklucza ODD z zapytania (compatibleWeekTypes)', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never);
    db.curriculumEntry.findUnique.mockResolvedValue({ curriculumVersion: { startSemesterType: 'WINTER' } } as never);
    db.scheduleTemplate.findMany.mockResolvedValue([] as never);
    await validateTemplate({ ...baseTemplateDto, weekType: 'EVEN' });
    expect(db.scheduleTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ weekType: { notIn: ['ODD'] } }) }),
    );
  });

  it('INSUFFICIENT_ROOM_CAPACITY gdy pojemnosc sali < rozmiar grupy', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue({ type: 'LECTURE', capacity: 10 } as never);
    db.studentGroup.findUnique.mockResolvedValue({ size: 30 } as never);
    const err = await validateTemplate({ ...baseTemplateDto, studentGroupId: 'g1' });
    expect(err).toMatchObject({ code: 'INSUFFICIENT_ROOM_CAPACITY', details: { roomCapacity: 10, groupSize: 30 } });
  });

  it('excludeId pomija edytowany wzorzec (where id != excludeId)', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never);
    db.curriculumEntry.findUnique.mockResolvedValue({ curriculumVersion: { startSemesterType: 'WINTER' } } as never);
    db.scheduleTemplate.findMany.mockResolvedValue([] as never);
    await validateTemplate({ ...baseTemplateDto, excludeId: 'self-1' });
    expect(db.scheduleTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 'self-1' } }) }),
    );
  });

  it('zwraca null gdy brak konfliktow', async () => {
    mockBlocks();
    db.room.findUnique.mockResolvedValue(null as never);
    db.curriculumEntry.findUnique.mockResolvedValue({ curriculumVersion: { startSemesterType: 'WINTER' } } as never);
    db.scheduleTemplate.findMany.mockResolvedValue([] as never);
    await expect(validateTemplate(baseTemplateDto)).resolves.toBeNull();
  });
});
