import type { ClassType, DayOfWeek, StudyMode, WeekType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getGroupFamilyIds } from '../lib/groupFamily';
import { roomTypeMap, compatibleWeekTypes, dayEnumToNum, checkTimeWindow, rangesOverlap } from '../lib/scheduleTime';

export type ValidationError =
  | { code: 'BAD_BLOCK_RANGE'; details: { message: string } }
  | { code: 'WRONG_ROOM_TYPE'; details: { roomType: string; classType: ClassType; allowed: string[] } }
  | { code: 'TIME_WINDOW_VIOLATION'; details: { message: string } }
  | { code: 'INSUFFICIENT_ROOM_CAPACITY'; details: { roomCapacity: number; groupSize: number } }
  | { code: 'ROOM_CONFLICT'; details: ConflictDetails }
  | { code: 'INSTRUCTOR_CONFLICT'; details: ConflictDetails }
  | { code: 'GROUP_CONFLICT'; details: ConflictDetails }
  | { code: 'HOURS_EXCEEDED'; details: { classType: ClassType; limit: number; alreadyPlanned: number; requested: number; remaining: number } };

type ConflictDetails = {
  conflictId: string;
  label: string; // np. nazwa sali / prowadzacego / grupy
  blockRange: string; // np. "08:00-10:00"
  when: string; // dzien tygodnia (szablon) lub data (wpis)
};

/** true jesli error powinien dac 400 (blad danych), false -> 409 (konflikt). */
export function isBadRequestError(err: ValidationError): boolean {
  return err.code === 'WRONG_ROOM_TYPE' || err.code === 'TIME_WINDOW_VIOLATION' || err.code === 'BAD_BLOCK_RANGE';
}

type BlockRange =
  | { ok: false; error: string }
  | { ok: true; startOrder: number; endOrder: number; startTime: string; endTime: string; hours: number };

/** Wczytuje zakres blokow i zwraca ich `order` + godzine startu/konca oraz liczbe godzin. */
async function loadBlockRange(startBlockId: string, endBlockId: string): Promise<BlockRange> {
  const [startBlock, endBlock] = await Promise.all([
    prisma.timeBlock.findUnique({ where: { id: startBlockId } }),
    prisma.timeBlock.findUnique({ where: { id: endBlockId } }),
  ]);
  if (!startBlock || !endBlock) {
    return { ok: false, error: 'Blok czasowy nie istnieje' };
  }
  if (endBlock.order < startBlock.order) {
    return { ok: false, error: 'Blok koncowy jest wczesniejszy niz poczatkowy' };
  }
  return {
    ok: true,
    startOrder: startBlock.order,
    endOrder: endBlock.order,
    startTime: startBlock.startTime,
    endTime: endBlock.endTime,
    hours: endBlock.order - startBlock.order + 1,
  };
}

export function checkRoomType(classType: ClassType, roomType: string): ValidationError | null {
  const allowed = roomTypeMap[classType];
  if (!allowed.includes(roomType as never)) {
    return { code: 'WRONG_ROOM_TYPE', details: { roomType, classType, allowed } };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  Walidacja SZABLONU (wzorzec tygodnia) — konflikty z innymi szablonami
// ═══════════════════════════════════════════════════════════════

export interface TemplateValidationDto {
  classType: ClassType;
  roomId: string;
  instructorId: string;
  studentGroupId?: string | null;
  dayOfWeek: DayOfWeek;
  startBlockId: string;
  endBlockId: string;
  academicYear: string;
  weekType: WeekType;
  studyMode: StudyMode;
  excludeId?: string;
}

/**
 * Walidacja wzorca patrzy WYLACZNIE na inne wzorce, a walidacja terminu wylacznie
 * na inne terminy. To celowe: wzorzec i kalendarz to dwa rozdzielone swiaty, ktore
 * spotykaja sie dopiero przy generowaniu semestru (tam konflikty liczy generator).
 * Nie "naprawiaj" tego, dokladajac tu zapytania o ScheduleEntry.
 */
export async function validateTemplate(dto: TemplateValidationDto): Promise<ValidationError | null> {
  const range = await loadBlockRange(dto.startBlockId, dto.endBlockId);
  if (!range.ok) return { code: 'BAD_BLOCK_RANGE', details: { message: range.error } };

  // Okno trybu studiow (dzien + godzina startu).
  const windowErr = checkTimeWindow(dayEnumToNum[dto.dayOfWeek], range.startTime, dto.studyMode);
  if (windowErr) return { code: 'TIME_WINDOW_VIOLATION', details: { message: windowErr } };

  // Typ i pojemnosc sali.
  const room = await prisma.room.findUnique({ where: { id: dto.roomId } });
  if (room) {
    const typeErr = checkRoomType(dto.classType, room.type);
    if (typeErr) return typeErr;
    if (dto.studentGroupId) {
      const group = await prisma.studentGroup.findUnique({ where: { id: dto.studentGroupId }, select: { size: true } });
      if (group && room.capacity < group.size) {
        return { code: 'INSUFFICIENT_ROOM_CAPACITY', details: { roomCapacity: room.capacity, groupSize: group.size } };
      }
    }
  }

  const excludeWeekTypes = compatibleWeekTypes(dto.weekType);
  const baseWhere = {
    dayOfWeek: dto.dayOfWeek,
    academicYear: dto.academicYear,
    ...(excludeWeekTypes.length > 0 ? { weekType: { notIn: excludeWeekTypes } } : {}),
    ...(dto.excludeId ? { id: { not: dto.excludeId } } : {}),
  };

  // Konflikt sali.
  const roomCandidates = await prisma.scheduleTemplate.findMany({
    where: { ...baseWhere, roomId: dto.roomId },
    include: {
      startBlock: { select: { order: true, startTime: true } },
      endBlock: { select: { order: true, endTime: true } },
      room: { select: { number: true, building: { select: { name: true } } } },
    },
  });
  const roomHit = roomCandidates.find((t) => rangesOverlap(range.startOrder, range.endOrder, t.startBlock.order, t.endBlock.order));
  if (roomHit) {
    return {
      code: 'ROOM_CONFLICT',
      details: {
        conflictId: roomHit.id,
        label: `${roomHit.room.building.name}, sala ${roomHit.room.number}`,
        blockRange: `${roomHit.startBlock.startTime}-${roomHit.endBlock.endTime}`,
        when: roomHit.dayOfWeek,
      },
    };
  }

  // Konflikt prowadzacego.
  const instrCandidates = await prisma.scheduleTemplate.findMany({
    where: { ...baseWhere, instructorId: dto.instructorId },
    include: {
      startBlock: { select: { order: true, startTime: true } },
      endBlock: { select: { order: true, endTime: true } },
      instructor: { select: { firstName: true, lastName: true, title: true } },
    },
  });
  const instrHit = instrCandidates.find((t) => rangesOverlap(range.startOrder, range.endOrder, t.startBlock.order, t.endBlock.order));
  if (instrHit) {
    const i = instrHit.instructor;
    return {
      code: 'INSTRUCTOR_CONFLICT',
      details: {
        conflictId: instrHit.id,
        label: `${i.title ? i.title + ' ' : ''}${i.firstName} ${i.lastName}`,
        blockRange: `${instrHit.startBlock.startTime}-${instrHit.endBlock.endTime}`,
        when: instrHit.dayOfWeek,
      },
    };
  }

  // Konflikt grupy (cala rodzina).
  if (dto.studentGroupId) {
    const familyIds = await getGroupFamilyIds(dto.studentGroupId);
    const groupCandidates = await prisma.scheduleTemplate.findMany({
      where: { ...baseWhere, studentGroupId: { in: familyIds } },
      include: {
        startBlock: { select: { order: true, startTime: true } },
        endBlock: { select: { order: true, endTime: true } },
        studentGroup: { select: { name: true } },
      },
    });
    const groupHit = groupCandidates.find((t) => rangesOverlap(range.startOrder, range.endOrder, t.startBlock.order, t.endBlock.order));
    if (groupHit) {
      return {
        code: 'GROUP_CONFLICT',
        details: {
          conflictId: groupHit.id,
          label: groupHit.studentGroup?.name ?? 'grupa',
          blockRange: `${groupHit.startBlock.startTime}-${groupHit.endBlock.endTime}`,
          when: groupHit.dayOfWeek,
        },
      };
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
//  Walidacja WPISU (konkretny termin) — konflikty z innymi wpisami tej daty
// ═══════════════════════════════════════════════════════════════

export interface EntryValidationDto {
  date: Date;
  roomId: string;
  instructorId: string;
  studentGroupId?: string | null;
  startBlockId: string;
  endBlockId: string;
  classType: ClassType;
  studyMode?: StudyMode;
  excludeId?: string;
  // Opcjonalne — limit godzin z siatki (przy recznym dodawaniu wpisu).
  curriculumEntryId?: string;
}

export async function validateEntry(dto: EntryValidationDto): Promise<ValidationError | null> {
  const range = await loadBlockRange(dto.startBlockId, dto.endBlockId);
  if (!range.ok) return { code: 'BAD_BLOCK_RANGE', details: { message: range.error } };

  // Typ sali.
  const room = await prisma.room.findUnique({ where: { id: dto.roomId } });
  if (room) {
    const typeErr = checkRoomType(dto.classType, room.type);
    if (typeErr) return typeErr;
  }

  // Okno trybu studiow.
  if (dto.studyMode) {
    const windowErr = checkTimeWindow(dto.date.getUTCDay(), range.startTime, dto.studyMode);
    if (windowErr) return { code: 'TIME_WINDOW_VIOLATION', details: { message: windowErr } };
  }

  // Limit godzin z siatki (liczony per grupa — kazda grupa potrzebuje pelnej puli osobno).
  if (dto.curriculumEntryId) {
    const currEntry = await prisma.curriculumEntry.findUnique({ where: { id: dto.curriculumEntryId } });
    if (currEntry) {
      const limitMap: Record<ClassType, number> = {
        LECTURE: currEntry.hoursLecture,
        EXERCISE: currEntry.hoursExercise,
        LAB: currEntry.hoursLab,
        PROJECT: currEntry.hoursProject,
        SEMINAR: currEntry.hoursSeminar,
      };
      const limit = limitMap[dto.classType];
      const planned = await plannedHours(dto.curriculumEntryId, dto.classType, dto.studentGroupId ?? null, dto.excludeId);
      if (planned + range.hours > limit) {
        return {
          code: 'HOURS_EXCEEDED',
          details: { classType: dto.classType, limit, alreadyPlanned: planned, requested: range.hours, remaining: limit - planned },
        };
      }
    }
  }

  // Zakres dnia UTC (generator uzywa poludnia UTC).
  const dayStart = new Date(dto.date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dto.date);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const dateRange = { gte: dayStart, lte: dayEnd };

  const baseWhere = {
    date: dateRange,
    status: { not: 'CANCELLED' as const },
    ...(dto.excludeId ? { id: { not: dto.excludeId } } : {}),
  };
  const blockInclude = {
    startBlock: { select: { order: true, startTime: true } },
    endBlock: { select: { order: true, endTime: true } },
  };

  const roomCandidates = await prisma.scheduleEntry.findMany({
    where: { ...baseWhere, roomId: dto.roomId },
    include: { ...blockInclude, room: { select: { number: true, building: { select: { name: true } } } } },
  });
  const roomHit = roomCandidates.find((e) => rangesOverlap(range.startOrder, range.endOrder, e.startBlock.order, e.endBlock.order));
  if (roomHit) {
    return {
      code: 'ROOM_CONFLICT',
      details: {
        conflictId: roomHit.id,
        label: `${roomHit.room.building.name}, sala ${roomHit.room.number}`,
        blockRange: `${roomHit.startBlock.startTime}-${roomHit.endBlock.endTime}`,
        when: roomHit.date.toISOString().split('T')[0]!,
      },
    };
  }

  const instrCandidates = await prisma.scheduleEntry.findMany({
    where: { ...baseWhere, instructorId: dto.instructorId },
    include: { ...blockInclude, instructor: { select: { firstName: true, lastName: true, title: true } } },
  });
  const instrHit = instrCandidates.find((e) => rangesOverlap(range.startOrder, range.endOrder, e.startBlock.order, e.endBlock.order));
  if (instrHit) {
    const i = instrHit.instructor;
    return {
      code: 'INSTRUCTOR_CONFLICT',
      details: {
        conflictId: instrHit.id,
        label: `${i.title ? i.title + ' ' : ''}${i.firstName} ${i.lastName}`,
        blockRange: `${instrHit.startBlock.startTime}-${instrHit.endBlock.endTime}`,
        when: instrHit.date.toISOString().split('T')[0]!,
      },
    };
  }

  if (dto.studentGroupId) {
    const familyIds = await getGroupFamilyIds(dto.studentGroupId);
    const groupCandidates = await prisma.scheduleEntry.findMany({
      where: { ...baseWhere, studentGroupId: { in: familyIds } },
      include: { ...blockInclude, studentGroup: { select: { name: true } } },
    });
    const groupHit = groupCandidates.find((e) => rangesOverlap(range.startOrder, range.endOrder, e.startBlock.order, e.endBlock.order));
    if (groupHit) {
      return {
        code: 'GROUP_CONFLICT',
        details: {
          conflictId: groupHit.id,
          label: groupHit.studentGroup?.name ?? 'grupa',
          blockRange: `${groupHit.startBlock.startTime}-${groupHit.endBlock.endTime}`,
          when: groupHit.date.toISOString().split('T')[0]!,
        },
      };
    }

    // Pojemnosc sali.
    const group = await prisma.studentGroup.findUnique({ where: { id: dto.studentGroupId }, select: { size: true } });
    if (room && group && room.capacity < group.size) {
      return { code: 'INSUFFICIENT_ROOM_CAPACITY', details: { roomCapacity: room.capacity, groupSize: group.size } };
    }
  }

  return null;
}

/**
 * Suma zaplanowanych godzin dla (wpis siatki + typ zajec + grupa), liczona z liczby
 * blokow kazdego wpisu (1 blok = 1 godzina). Wpisy odwolane nie licza sie.
 */
export async function plannedHours(
  curriculumEntryId: string,
  classType: ClassType,
  studentGroupId: string | null,
  excludeId?: string,
): Promise<number> {
  const entries = await prisma.scheduleEntry.findMany({
    where: {
      curriculumEntryId,
      classType,
      studentGroupId,
      status: { not: 'CANCELLED' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: { startBlock: { select: { order: true } }, endBlock: { select: { order: true } } },
  });
  return entries.reduce((sum, e) => sum + (e.endBlock.order - e.startBlock.order + 1), 0);
}
