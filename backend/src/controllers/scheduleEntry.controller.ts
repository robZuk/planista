import type { Request, Response } from 'express';
import type { ClassType, EntryStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isNotFoundError } from '../lib/prismaErrors';
import { validateEntry, isBadRequestError, checkRoomType } from '../services/scheduleValidation';
import { getGroupFamilyIds } from '../lib/groupFamily';
import { getCallerInstructorId } from '../lib/callerInstructor';
import { rangesOverlap, dayNumToEnum, checkTimeWindow, dateToStr } from '../lib/scheduleTime';

const entryInclude = {
  room: { select: { id: true, number: true, type: true, building: { select: { id: true, name: true } } } },
  instructor: { select: { id: true, firstName: true, lastName: true, title: true } },
  studentGroup: { select: { id: true, name: true } },
  curriculumEntry: { include: { subject: { select: { id: true, name: true } } } },
  template: { select: { id: true, dayOfWeek: true, weekType: true, studyMode: true } },
  startBlock: { select: { id: true, order: true, startTime: true, label: true } },
  endBlock: { select: { id: true, order: true, endTime: true, label: true } },
};

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const { from, to, studentGroupId, instructorId, status } = req.query;
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(String(from) + 'T00:00:00.000Z');
    if (to) dateFilter.lte = new Date(String(to) + 'T23:59:59.999Z');

    const data = await prisma.scheduleEntry.findMany({
      where: {
        ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
        ...(studentGroupId ? { studentGroupId: String(studentGroupId) } : {}),
        ...(instructorId ? { instructorId: String(instructorId) } : {}),
        ...(status ? { status: status as EntryStatus } : {}),
      },
      include: entryInclude,
      orderBy: [{ date: 'asc' }, { startBlock: { order: 'asc' } }],
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

/**
 * Recznie dodany pojedynczy termin — bez wzorca (templateId=null). Sluzy np. do
 * dodania odrobienia zajec (status MAKEUP) w wolnym terminie kalendarza.
 */
export async function create(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      date?: string;
      classType?: ClassType;
      roomId?: string;
      instructorId?: string;
      studentGroupId?: string | null;
      curriculumEntryId?: string;
      startBlockId?: string;
      endBlockId?: string;
      status?: EntryStatus;
    };

    if (!body.date || !body.classType || !body.roomId || !body.instructorId ||
        !body.curriculumEntryId || !body.startBlockId || !body.endBlockId) {
      res.status(400).json({ error: 'Brakujace wymagane pola' });
      return;
    }

    if (req.user!.role === 'INSTRUCTOR') {
      const myInstructorId = await getCallerInstructorId(req.user!.id);
      if (myInstructorId !== body.instructorId) {
        res.status(403).json({ error: 'Mozesz dodawac terminy tylko dla siebie' });
        return;
      }
    }

    const error = await validateEntry({
      date: new Date(body.date),
      roomId: body.roomId,
      instructorId: body.instructorId,
      studentGroupId: body.studentGroupId ?? null,
      startBlockId: body.startBlockId,
      endBlockId: body.endBlockId,
      classType: body.classType,
      curriculumEntryId: body.curriculumEntryId,
    });
    if (error) {
      res.status(isBadRequestError(error) ? 400 : 409).json({ error: error.code, details: error.details });
      return;
    }

    const data = await prisma.scheduleEntry.create({
      data: {
        date: new Date(body.date),
        classType: body.classType,
        roomId: body.roomId,
        instructorId: body.instructorId,
        studentGroupId: body.studentGroupId ?? null,
        curriculumEntryId: body.curriculumEntryId,
        startBlockId: body.startBlockId,
        endBlockId: body.endBlockId,
        templateId: null,
        status: body.status ?? 'MAKEUP',
      },
      include: entryInclude,
    });
    res.status(201).json({ data, message: 'Termin dodany' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

/** Odwolanie / zmiana statusu / usuniecie pojedynczego terminu. */
export async function updateStatus(req: Request, res: Response): Promise<void> {
  try {
    const { status } = req.body as { status?: EntryStatus };
    if (!status) {
      res.status(400).json({ error: 'Brakujace pole: status' });
      return;
    }
    const existing = await prisma.scheduleEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Termin nie znaleziony' });
      return;
    }
    if (req.user!.role === 'INSTRUCTOR') {
      const my = await getCallerInstructorId(req.user!.id);
      if (my !== existing.instructorId) {
        res.status(403).json({ error: 'Mozesz edytowac tylko wlasne terminy' });
        return;
      }
    }
    const data = await prisma.scheduleEntry.update({ where: { id: req.params.id }, data: { status }, include: entryInclude });
    res.json({ data, message: 'Status terminu zaktualizowany' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Termin nie znaleziony' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.scheduleEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Termin nie znaleziony' });
      return;
    }
    if (req.user!.role === 'INSTRUCTOR') {
      const my = await getCallerInstructorId(req.user!.id);
      if (my !== existing.instructorId) {
        res.status(403).json({ error: 'Mozesz usuwac tylko wlasne terminy' });
        return;
      }
    }
    await prisma.scheduleEntry.delete({ where: { id: req.params.id } });
    res.json({ message: 'Termin usuniety' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Termin nie znaleziony' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

/**
 * Przeniesienie terminu (drag&drop).
 *  scope 'ONE' — tylko ten termin (nowa data + zakres blokow + opc. sala/prowadzacy).
 *  scope 'ALL' — caly semestr: aktualizuje WZORZEC i przesuwa przyszle terminy na
 *                nowy dzien tygodnia + bloki (pomija dni wolne).
 */
export async function move(req: Request, res: Response): Promise<void> {
  try {
    const { newDate, newStartBlockId, newEndBlockId, newRoomId, newInstructorId, scope } = req.body as {
      newDate?: string;
      newStartBlockId?: string;
      newEndBlockId?: string;
      newRoomId?: string;
      newInstructorId?: string;
      scope?: 'ONE' | 'ALL';
    };

    if (!newDate || !newStartBlockId || !newEndBlockId || !scope) {
      res.status(400).json({ error: 'Brakujace pola: newDate, newStartBlockId, newEndBlockId, scope' });
      return;
    }

    const existing = await prisma.scheduleEntry.findUnique({ where: { id: req.params.id }, include: { template: true } });
    if (!existing) {
      res.status(404).json({ error: 'Termin nie znaleziony' });
      return;
    }
    if (req.user!.role === 'INSTRUCTOR') {
      const my = await getCallerInstructorId(req.user!.id);
      if (my !== existing.instructorId) {
        res.status(403).json({ error: 'Mozesz przenosic tylko wlasne terminy' });
        return;
      }
    }

    const targetRoomId = newRoomId ?? existing.roomId;
    const targetInstructorId = newInstructorId ?? existing.instructorId;
    const studyMode = existing.template?.studyMode;

    // ─── scope ONE ──────────────────────────────────────────
    if (scope === 'ONE') {
      const error = await validateEntry({
        date: new Date(newDate),
        roomId: targetRoomId,
        instructorId: targetInstructorId,
        studentGroupId: existing.studentGroupId,
        startBlockId: newStartBlockId,
        endBlockId: newEndBlockId,
        classType: existing.classType,
        studyMode: studyMode ?? undefined,
        excludeId: existing.id,
      });
      if (error) {
        res.status(isBadRequestError(error) ? 400 : 409).json({ error: error.code, details: error.details });
        return;
      }
      const data = await prisma.scheduleEntry.update({
        where: { id: req.params.id },
        data: {
          date: new Date(newDate),
          startBlockId: newStartBlockId,
          endBlockId: newEndBlockId,
          roomId: targetRoomId,
          instructorId: targetInstructorId,
        },
        include: entryInclude,
      });
      res.json({ data, message: 'Przeniesiono jeden termin' });
      return;
    }

    // ─── scope ALL ──────────────────────────────────────────
    if (!existing.templateId) {
      res.status(400).json({ error: 'Brak wzorca — nie mozna przeniesc calego semestru' });
      return;
    }

    const targetDate = new Date(newDate);
    const targetDayNum = targetDate.getUTCDay();

    // Sprawdz typ sali i okno trybu dla nowego umiejscowienia.
    const startBlock = await prisma.timeBlock.findUnique({ where: { id: newStartBlockId } });
    const room = await prisma.room.findUnique({ where: { id: targetRoomId }, select: { type: true } });
    if (room) {
      const typeErr = checkRoomType(existing.classType, room.type);
      if (typeErr) {
        res.status(400).json({ error: typeErr.code, details: typeErr.details });
        return;
      }
    }
    if (studyMode && startBlock) {
      const windowErr = checkTimeWindow(targetDayNum, startBlock.startTime, studyMode);
      if (windowErr) {
        res.status(400).json({ error: 'TIME_WINDOW_VIOLATION', details: { message: windowErr } });
        return;
      }
    }

    const fromDate = new Date(existing.date);
    fromDate.setUTCHours(0, 0, 0, 0);
    const futureEntries = await prisma.scheduleEntry.findMany({
      where: { templateId: existing.templateId, date: { gte: fromDate }, status: { not: 'CANCELLED' } },
      orderBy: { date: 'asc' },
    });
    const futureIds = futureEntries.map((e) => e.id);

    // Nowe daty (ten sam tydzien, przesuniete na docelowy dzien tygodnia); pomijamy dni wolne.
    const shifted = futureEntries.map((e) => {
      const d = new Date(e.date);
      d.setUTCDate(d.getUTCDate() + (targetDayNum - d.getUTCDay()));
      d.setUTCHours(12, 0, 0, 0);
      return { entry: e, target: d };
    });
    const holidayList = await prisma.publicHoliday.findMany();
    const holidaySet = new Set(holidayList.map((h) => dateToStr(h.date)));
    const movable = shifted.filter((s) => !holidaySet.has(dateToStr(s.target)));

    // Zakres blokow docelowy (order) do sprawdzenia konfliktow.
    const [ns, ne] = await Promise.all([
      prisma.timeBlock.findUnique({ where: { id: newStartBlockId }, select: { order: true } }),
      prisma.timeBlock.findUnique({ where: { id: newEndBlockId }, select: { order: true } }),
    ]);
    if (!ns || !ne || ne.order < ns.order) {
      res.status(400).json({ error: 'BAD_BLOCK_RANGE', details: { message: 'Nieprawidlowy zakres blokow' } });
      return;
    }
    const groupFamilyIds = existing.studentGroupId ? await getGroupFamilyIds(existing.studentGroupId) : [];

    // Konflikty: dla kazdej docelowej daty sprawdz wpisy SPOZA przenoszonego zbioru.
    for (const { target } of movable) {
      const dayStart = new Date(target);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(target);
      dayEnd.setUTCHours(23, 59, 59, 999);
      const base = { date: { gte: dayStart, lte: dayEnd }, status: { not: 'CANCELLED' as const }, id: { notIn: futureIds } };
      const inc = { startBlock: { select: { order: true } }, endBlock: { select: { order: true } } };
      const overlaps = (list: { startBlock: { order: number }; endBlock: { order: number } }[]) =>
        list.some((x) => rangesOverlap(ns.order, ne.order, x.startBlock.order, x.endBlock.order));

      const roomC = await prisma.scheduleEntry.findMany({ where: { ...base, roomId: targetRoomId }, include: inc });
      if (overlaps(roomC)) {
        res.status(409).json({ error: 'ROOM_CONFLICT', details: { when: dateToStr(target) } });
        return;
      }
      const instrC = await prisma.scheduleEntry.findMany({ where: { ...base, instructorId: targetInstructorId }, include: inc });
      if (overlaps(instrC)) {
        res.status(409).json({ error: 'INSTRUCTOR_CONFLICT', details: { when: dateToStr(target) } });
        return;
      }
      if (groupFamilyIds.length > 0) {
        const groupC = await prisma.scheduleEntry.findMany({ where: { ...base, studentGroupId: { in: groupFamilyIds } }, include: inc });
        if (overlaps(groupC)) {
          res.status(409).json({ error: 'GROUP_CONFLICT', details: { when: dateToStr(target) } });
          return;
        }
      }
    }

    // Aktualizuj wzorzec + przesun przyszle terminy w transakcji.
    await prisma.$transaction([
      prisma.scheduleTemplate.update({
        where: { id: existing.templateId },
        data: {
          dayOfWeek: dayNumToEnum[targetDayNum],
          startBlockId: newStartBlockId,
          endBlockId: newEndBlockId,
          roomId: targetRoomId,
          instructorId: targetInstructorId,
        },
      }),
      ...movable.map(({ entry, target }) =>
        prisma.scheduleEntry.update({
          where: { id: entry.id },
          data: {
            date: target,
            startBlockId: newStartBlockId,
            endBlockId: newEndBlockId,
            roomId: targetRoomId,
            instructorId: targetInstructorId,
          },
        }),
      ),
    ]);

    const skippedHolidays = futureEntries.length - movable.length;
    res.json({
      data: { updatedCount: movable.length, skippedHolidays },
      message: `Zaktualizowano wzorzec i ${movable.length} przyszlych terminow${skippedHolidays > 0 ? `, pominieto ${skippedHolidays} (dni wolne)` : ''}`,
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Termin nie znaleziony' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
