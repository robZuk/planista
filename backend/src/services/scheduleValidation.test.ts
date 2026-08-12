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

  // Kolejne sciezki do dopisania — struktura mockow jak wyzej:
  it.todo('WRONG_ROOM_TYPE gdy typ sali niezgodny (room.findUnique zwraca zla sale)');
  it.todo('TIME_WINDOW_VIOLATION gdy PART_TIME poza oknem (pt < 15:00 / pon-czw)');
  it.todo('ROOM_CONFLICT gdy inny wpis tej daty zajmuje ta sale w nachodzacym zakresie');
  it.todo('INSTRUCTOR_CONFLICT gdy prowadzacy ma inny wpis w nachodzacym zakresie');
  it.todo('GROUP_CONFLICT gdy grupa (cala rodzina) ma juz wpis w nachodzacym zakresie');
  it.todo('INSUFFICIENT_ROOM_CAPACITY gdy pojemnosc sali < rozmiar grupy');
  it.todo('zwraca null gdy wszystko sie zgadza (brak konfliktow)');
  it.todo('excludeId pomija wskazany wpis (edycja tego samego terminu nie koliduje sama ze soba)');
  it.todo('CANCELLED wpisy nie licza sie jako konflikt');
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

  // Sciezki do dopisania — pamietaj o `sameSemesterType`: koliduja tylko wzorce
  // tego samego typu semestru (zimowy/letni), liczonego z siatki KAZDEGO wzorca.
  it.todo('TIME_WINDOW_VIOLATION gdy FULL_TIME w sobote/niedziele');
  it.todo('ROOM_CONFLICT z innym wzorcem tego samego typu semestru i nachodzacym zakresem');
  it.todo('brak ROOM_CONFLICT gdy kandydat jest z przeciwnego typu semestru (zima vs lato)');
  it.todo('INSTRUCTOR_CONFLICT z innym wzorcem prowadzacego');
  it.todo('GROUP_CONFLICT obejmuje cala rodzine grup (getGroupFamilyIds)');
  it.todo('weekType EVEN nie koliduje z ODD w tym samym slocie (compatibleWeekTypes)');
  it.todo('INSUFFICIENT_ROOM_CAPACITY gdy pojemnosc sali < rozmiar grupy');
  it.todo('excludeId pomija edytowany wzorzec');
  it.todo('zwraca null gdy brak konfliktow');
});
