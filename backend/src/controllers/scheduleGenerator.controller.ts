import type { Request, Response } from 'express';
import type { ClassType, SemesterType, StudyMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getGroupFamilyIds } from '../lib/groupFamily';
import {
  getDatesForDayOfWeek,
  isInStudyModeWindow,
  dateToStr,
  deriveCalendarDates,
  rangesOverlap,
} from '../lib/scheduleTime';

type SkipReason = 'HOLIDAY' | 'OUT_OF_WINDOW' | 'ALREADY_EXISTS' | 'HOURS_EXCEEDED';

/**
 * Sprawdza kolizje konkretnego terminu (data + zakres blokow) z istniejacymi
 * wpisami — sala / prowadzacy / rodzina grup. Zwraca typ konfliktu lub null.
 */
async function findEntryConflict(
  date: Date,
  startOrder: number,
  endOrder: number,
  roomId: string,
  instructorId: string,
  groupFamilyIds: string[],
): Promise<'ROOM_CONFLICT' | 'INSTRUCTOR_CONFLICT' | 'GROUP_CONFLICT' | null> {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const base = { date: { gte: dayStart, lte: dayEnd }, status: { not: 'CANCELLED' as const } };
  const inc = { startBlock: { select: { order: true } }, endBlock: { select: { order: true } } };

  const overlaps = (list: { startBlock: { order: number }; endBlock: { order: number } }[]) =>
    list.some((e) => rangesOverlap(startOrder, endOrder, e.startBlock.order, e.endBlock.order));

  const roomEntries = await prisma.scheduleEntry.findMany({ where: { ...base, roomId }, include: inc });
  if (overlaps(roomEntries)) return 'ROOM_CONFLICT';

  const instrEntries = await prisma.scheduleEntry.findMany({ where: { ...base, instructorId }, include: inc });
  if (overlaps(instrEntries)) return 'INSTRUCTOR_CONFLICT';

  if (groupFamilyIds.length > 0) {
    const groupEntries = await prisma.scheduleEntry.findMany({
      where: { ...base, studentGroupId: { in: groupFamilyIds } },
      include: inc,
    });
    if (overlaps(groupEntries)) return 'GROUP_CONFLICT';
  }
  return null;
}

export async function generateSemester(req: Request, res: Response): Promise<void> {
  try {
    const { templateIds, academicYear, semesterType, studyMode } = req.body as {
      templateIds?: string[];
      academicYear?: string;
      semesterType?: SemesterType;
      studyMode?: StudyMode;
    };

    if (!templateIds?.length || !academicYear || !semesterType || !studyMode) {
      res.status(400).json({ error: 'Brakujace pola: templateIds, academicYear, semesterType, studyMode' });
      return;
    }

    // Zakres dat semestru — z kalendarza lub domyslny.
    const savedCalendar = await prisma.semesterCalendar.findFirst({ where: { academicYear, semesterType, studyMode } });
    const { startDate, endDate } = savedCalendar ?? deriveCalendarDates(academicYear, semesterType);

    const holidays = await prisma.publicHoliday.findMany({ where: { date: { gte: startDate, lte: endDate } } });
    const holidaySet = new Set(holidays.map((h) => dateToStr(h.date)));

    // Mapa order -> TimeBlock (do skracania ostatniego bloku do limitu godzin).
    const allBlocks = await prisma.timeBlock.findMany();
    const blockByOrder = new Map(allBlocks.map((b) => [b.order, b]));

    const templates = await prisma.scheduleTemplate.findMany({
      where: { id: { in: templateIds } },
      include: {
        curriculumEntry: { include: { subject: { select: { name: true } } } },
        studentGroup: { select: { name: true } },
        room: { select: { number: true } },
        startBlock: { select: { order: true, startTime: true } },
        endBlock: { select: { order: true, endTime: true } },
      },
    });

    const created: unknown[] = [];
    const skipped: { templateId: string; date: string; reason: SkipReason; subjectName: string }[] = [];
    const conflicts: { templateId: string; date: string; type: string; subjectName: string }[] = [];

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

      // Zaplanowane godziny przez INNE wzorce tej samej (grupa+typ) — wpisy tego wzorca
      // doliczy petla (galaz ALREADY_EXISTS), by uniknac podwojnego liczenia.
      const otherEntries = await prisma.scheduleEntry.findMany({
        where: {
          curriculumEntryId: template.curriculumEntryId,
          classType: template.classType,
          studentGroupId: template.studentGroupId,
          templateId: { not: template.id },
          status: { not: 'CANCELLED' },
          date: { gte: startDate, lte: endDate },
        },
        include: { startBlock: { select: { order: true } }, endBlock: { select: { order: true } } },
      });
      let accumulated = otherEntries.reduce((s, e) => s + (e.endBlock.order - e.startBlock.order + 1), 0);

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

        // Idempotentnosc: wpis z tego wzorca na te date juz istnieje.
        const alreadyExists = await prisma.scheduleEntry.findFirst({
          where: { templateId: template.id, date },
          include: { startBlock: { select: { order: true } }, endBlock: { select: { order: true } } },
        });
        if (alreadyExists) {
          accumulated += alreadyExists.endBlock.order - alreadyExists.startBlock.order + 1;
          skipped.push({ templateId: template.id, date: date.toISOString(), reason: 'ALREADY_EXISTS', subjectName: ce.subject.name });
          continue;
        }

        // Skrocenie ostatniego bloku, by dobic dokladnie do limitu godzin.
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

        const conflict = await findEntryConflict(
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

        const entry = await prisma.scheduleEntry.create({
          data: {
            date,
            status: 'SCHEDULED',
            classType: template.classType,
            startBlockId: template.startBlockId,
            endBlockId,
            templateId: template.id,
            roomId: template.roomId,
            instructorId: template.instructorId,
            curriculumEntryId: template.curriculumEntryId,
            studentGroupId: template.studentGroupId,
          },
        });
        accumulated += blockHours;
        created.push(entry);
      }
    }

    const actualSkipped = skipped.filter((s) => s.reason !== 'ALREADY_EXISTS');
    const alreadyExists = skipped.length - actualSkipped.length;

    res.json({
      data: {
        created: created.length,
        skipped: actualSkipped.length,
        alreadyExists,
        conflicts: conflicts.length,
      },
      details: { skipped: actualSkipped, conflicts },
      message: `Wygenerowano ${created.length} terminow, pominieto ${actualSkipped.length}, juz istnialo ${alreadyExists}, konflikty ${conflicts.length}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
