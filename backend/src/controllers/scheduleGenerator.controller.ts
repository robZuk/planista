import type { Request, Response } from 'express';
import type { ClassType, SemesterType, StudyMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getGroupFamilyIds } from '../lib/groupFamily';
import { getCallerFacultyId } from '../lib/callerFaculty';
import { resolveSemesterRange } from '../lib/semesterCalendar';
import { getDatesForDayOfWeek, isInStudyModeWindow, dateToStr, rangesOverlap } from '../lib/scheduleTime';

type SkipReason = 'HOLIDAY' | 'OUT_OF_WINDOW' | 'HOURS_EXCEEDED';

/** Zajetosc zasobow w danym dniu — przedzial blokow [startOrder..endOrder]. */
interface Busy {
  startOrder: number;
  endOrder: number;
  roomId: string;
  instructorId: string;
  studentGroupId: string | null;
}

interface NewEntry {
  date: Date;
  status: 'SCHEDULED';
  classType: ClassType;
  startBlockId: string;
  endBlockId: string;
  templateId: string;
  facultyId: string;
  roomId: string;
  instructorId: string;
  curriculumEntryId: string;
  studentGroupId: string | null;
}

/**
 * Generator terminow semestru.
 *
 * Kalendarz wydzialu jest NADPISYWANY W CALOSCI: wszystkie terminy tego wydzialu
 * w zakresie dat semestru — takze dodane recznie i odwolane — sa kasowane, po czym
 * plan powstaje od zera z aktualnych wzorcow. To jedyny punkt synchronizacji miedzy
 * wzorcem tygodnia a kalendarzem; poza nim oba swiaty sa rozdzielone.
 *
 * Konflikty liczymy w pamieci wzgledem terminow POZOSTALYCH wydzialow (sale
 * i prowadzacy sa wspoldzieleni), dokladajac na biezaco swiezo zaplanowane zajecia.
 */
export async function generateSemester(req: Request, res: Response): Promise<void> {
  try {
    const { templateIds, academicYear, semesterType, studyMode, facultyId: bodyFacultyId } = req.body as {
      templateIds?: string[];
      academicYear?: string;
      semesterType?: SemesterType;
      studyMode?: StudyMode;
      facultyId?: string;
    };

    if (!templateIds?.length || !academicYear || !semesterType || !studyMode) {
      res.status(400).json({ error: 'Brakujace pola: templateIds, academicYear, semesterType, studyMode' });
      return;
    }

    // Dziekanat rozpisuje wylacznie wlasny wydzial; admin musi wskazac jeden konkretny.
    // Operacja jest destrukcyjna, wiec "wszystkie wydzialy naraz" nie jest dozwolone.
    const facultyId =
      req.user!.role === 'DEAN_OFFICE' ? await getCallerFacultyId(req.user!.id) : bodyFacultyId;
    if (!facultyId) {
      res.status(400).json({
        error: 'FACULTY_REQUIRED',
        details: { message: 'Generowanie wymaga wskazania jednego wydzialu' },
      });
      return;
    }

    const range = await resolveSemesterRange(academicYear, semesterType, studyMode, facultyId);
    const { startDate, endDate } = range;
    const dateRange = { gte: startDate, lte: endDate };

    const holidays = await prisma.publicHoliday.findMany({ where: { date: dateRange } });
    const holidaySet = new Set(holidays.map((h) => dateToStr(h.date)));

    // Mapa order -> TimeBlock (do skracania ostatniego bloku do limitu godzin).
    const allBlocks = await prisma.timeBlock.findMany();
    const blockByOrder = new Map(allBlocks.map((b) => [b.order, b]));

    const templates = await prisma.scheduleTemplate.findMany({
      // Zawezenie do wydzialu — wzorce spoza niego nie zostana rozpisane, nawet jesli
      // ich id trafi w templateIds (ochrona przed spreparowanym zadaniem).
      where: { id: { in: templateIds }, facultyId },
      include: {
        curriculumEntry: { include: { subject: { select: { name: true } } } },
        startBlock: { select: { order: true, startTime: true } },
        endBlock: { select: { order: true } },
      },
    });

    // ─── Co znika przy nadpisaniu ─────────────────────────────
    const doomed = await prisma.scheduleEntry.findMany({
      where: { facultyId, date: dateRange },
      select: { templateId: true },
    });
    const deletedManual = doomed.filter((e) => e.templateId === null).length;

    // ─── Zajetosc: terminy pozostalych wydzialow ──────────────
    const survivors = await prisma.scheduleEntry.findMany({
      where: { date: dateRange, status: { not: 'CANCELLED' }, facultyId: { not: facultyId } },
      select: {
        date: true,
        roomId: true,
        instructorId: true,
        studentGroupId: true,
        startBlock: { select: { order: true } },
        endBlock: { select: { order: true } },
      },
    });

    const busyByDay = new Map<string, Busy[]>();
    const addBusy = (date: Date, busy: Busy) => {
      const key = dateToStr(date);
      const list = busyByDay.get(key);
      if (list) list.push(busy);
      else busyByDay.set(key, [busy]);
    };
    for (const s of survivors) {
      addBusy(s.date, {
        startOrder: s.startBlock.order,
        endOrder: s.endBlock.order,
        roomId: s.roomId,
        instructorId: s.instructorId,
        studentGroupId: s.studentGroupId,
      });
    }

    const findConflict = (
      date: Date,
      startOrder: number,
      endOrder: number,
      roomId: string,
      instructorId: string,
      groupFamilyIds: string[],
    ): 'ROOM_CONFLICT' | 'INSTRUCTOR_CONFLICT' | 'GROUP_CONFLICT' | null => {
      const list = busyByDay.get(dateToStr(date));
      if (!list) return null;
      for (const busy of list) {
        if (!rangesOverlap(startOrder, endOrder, busy.startOrder, busy.endOrder)) continue;
        if (busy.roomId === roomId) return 'ROOM_CONFLICT';
        if (busy.instructorId === instructorId) return 'INSTRUCTOR_CONFLICT';
        if (busy.studentGroupId && groupFamilyIds.includes(busy.studentGroupId)) return 'GROUP_CONFLICT';
      }
      return null;
    };

    // ─── Rozpisanie w pamieci ─────────────────────────────────
    const toCreate: NewEntry[] = [];
    const skipped: { templateId: string; date: string; reason: SkipReason; subjectName: string }[] = [];
    const conflicts: { templateId: string; date: string; type: string; subjectName: string }[] = [];

    // Godziny juz rozpisane w TYM przebiegu, per (wpis siatki + typ zajec + grupa).
    // Kalendarz wydzialu startuje pusty, wiec to jedyne zrodlo licznika.
    const plannedHours = new Map<string, number>();
    const hoursKey = (template: { curriculumEntryId: string; classType: ClassType; studentGroupId: string | null }) =>
      `${template.curriculumEntryId}|${template.classType}|${template.studentGroupId ?? ''}`;

    for (const template of templates) {
      const dates = getDatesForDayOfWeek(startDate, endDate, template.dayOfWeek, template.weekType);
      const duration = template.endBlock.order - template.startBlock.order + 1;

      // Limit godzin z siatki dla (wpis siatki + typ zajec).
      const ce = template.curriculumEntry;
      const limitMap: Record<ClassType, number> = {
        LECTURE: ce.hoursLecture,
        EXERCISE: ce.hoursExercise,
        LAB: ce.hoursLab,
        PROJECT: ce.hoursProject,
        SEMINAR: ce.hoursSeminar,
      };
      const hoursLimit = limitMap[template.classType];
      const key = hoursKey(template);
      const groupFamilyIds = template.studentGroupId ? await getGroupFamilyIds(template.studentGroupId) : [];

      for (const date of dates) {
        if (holidaySet.has(dateToStr(date))) {
          skipped.push({ templateId: template.id, date: date.toISOString(), reason: 'HOLIDAY', subjectName: ce.subject.name });
          continue;
        }
        if (!isInStudyModeWindow(date, studyMode, template.startBlock.startTime)) {
          skipped.push({ templateId: template.id, date: date.toISOString(), reason: 'OUT_OF_WINDOW', subjectName: ce.subject.name });
          continue;
        }

        // Skrocenie ostatniego bloku, by dobic dokladnie do limitu godzin.
        const accumulated = plannedHours.get(key) ?? 0;
        let endBlockId = template.endBlockId;
        let endOrder = template.endBlock.order;
        let blockHours = duration;
        if (accumulated + duration > hoursLimit) {
          const remaining = hoursLimit - accumulated;
          if (remaining <= 0) {
            skipped.push({ templateId: template.id, date: date.toISOString(), reason: 'HOURS_EXCEEDED', subjectName: ce.subject.name });
            continue;
          }
          const shortenedEnd = blockByOrder.get(template.startBlock.order + remaining - 1);
          if (shortenedEnd) {
            endBlockId = shortenedEnd.id;
            endOrder = shortenedEnd.order;
            blockHours = remaining;
          }
        }

        const conflict = findConflict(
          date,
          template.startBlock.order,
          endOrder,
          template.roomId,
          template.instructorId,
          groupFamilyIds,
        );
        if (conflict) {
          conflicts.push({ templateId: template.id, date: date.toISOString(), type: conflict, subjectName: ce.subject.name });
          continue;
        }

        toCreate.push({
          date,
          status: 'SCHEDULED',
          classType: template.classType,
          startBlockId: template.startBlockId,
          endBlockId,
          templateId: template.id,
          facultyId,
          roomId: template.roomId,
          instructorId: template.instructorId,
          curriculumEntryId: template.curriculumEntryId,
          studentGroupId: template.studentGroupId,
        });
        // Swiezo zaplanowany termin od razu zajmuje zasoby dla kolejnych wzorcow.
        addBusy(date, {
          startOrder: template.startBlock.order,
          endOrder,
          roomId: template.roomId,
          instructorId: template.instructorId,
          studentGroupId: template.studentGroupId,
        });
        plannedHours.set(key, accumulated + blockHours);
      }
    }

    // ─── Zapis atomowy: kasujemy kalendarz wydzialu i wstawiamy nowy ───
    await prisma.$transaction([
      prisma.scheduleEntry.deleteMany({ where: { facultyId, date: dateRange } }),
      prisma.scheduleEntry.createMany({ data: toCreate }),
    ]);

    res.json({
      data: {
        deleted: { total: doomed.length, manual: deletedManual },
        created: toCreate.length,
        skipped: skipped.length,
        conflicts: conflicts.length,
        range: { startDate: startDate.toISOString(), endDate: endDate.toISOString(), source: range.source },
      },
      details: { skipped, conflicts },
      message:
        `Nadpisano kalendarz wydzialu: skasowano ${doomed.length} terminow` +
        `${deletedManual > 0 ? ` (w tym ${deletedManual} recznych)` : ''}` +
        `, utworzono ${toCreate.length}, pominieto ${skipped.length}, konflikty ${conflicts.length}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
