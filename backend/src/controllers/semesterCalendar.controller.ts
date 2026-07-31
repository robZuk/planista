import type { Request, Response } from 'express';
import type { SemesterCalendar, SemesterType, StudyMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isNotFoundError, isUniqueConstraintError } from '../lib/prismaErrors';
import { getCallerFacultyId } from '../lib/callerFaculty';
import { semesterTypeOf } from '../lib/semester';

const calendarInclude = {
  faculty: { select: { id: true, name: true, shortName: true } },
};

/** Klucz dopasowania kalendarza do planu — bez wydzialu, ktory rozstrzygamy osobno. */
function scopeKey(item: { academicYear: string; semesterType: SemesterType; studyMode: StudyMode }) {
  return `${item.academicYear}|${item.semesterType}|${item.studyMode}`;
}

/**
 * Co realnie wisi na kalendarzu: ile wzorcow tygodnia rozpisze sie z jego zakresu dat
 * i ile terminow juz w nim stoi. Kalendarz nie ma relacji do wzorca — wiazemy je
 * czworka [rok, typ semestru, tryb, wydzial], a typ semestru wzorca liczymy z naboru
 * KAZDEJ siatki osobno (semestr 1 bywa letni), nie z parzystosci numeru.
 *
 * Kazdy kalendarz obsluguje dokladnie jeden wydzial, wiec zasieg jest tu trywialny —
 * przy wariancie ogolnouczelnianym trzeba bylo najpierw ustalic, ktore wydzialy nie
 * maja wlasnego wpisu.
 */
async function buildUsage(calendars: SemesterCalendar[]) {
  // Wzorce sciagamy raz i kubelkujemy w pamieci — jest ich rzedy wielkosci mniej
  // niz terminow, a per kalendarz i tak potrzebujemy tylko licznika.
  const templates = await prisma.scheduleTemplate.findMany({
    select: {
      facultyId: true,
      academicYear: true,
      studyMode: true,
      semester: true,
      curriculumEntry: { select: { curriculumVersion: { select: { startSemesterType: true } } } },
    },
  });

  const templateCounts = new Map<string, number>();
  for (const template of templates) {
    const semesterType = semesterTypeOf(
      template.curriculumEntry.curriculumVersion.startSemesterType,
      template.semester,
    );
    const key = `${scopeKey({ ...template, semesterType })}|${template.facultyId}`;
    templateCounts.set(key, (templateCounts.get(key) ?? 0) + 1);
  }

  // Terminy liczymy zapytaniem per kalendarz — kazdy ma wlasny zakres dat, wiec jednego
  // groupBy i tak by nie bylo. Indeks [facultyId, date] to obsluguje.
  const entryCounts = await Promise.all(
    calendars.map((calendar) => {
      const rangeStart = new Date(calendar.startDate);
      rangeStart.setUTCHours(0, 0, 0, 0);
      const rangeEnd = new Date(calendar.endDate);
      rangeEnd.setUTCHours(23, 59, 59, 999);
      return prisma.scheduleEntry.count({
        where: {
          facultyId: calendar.facultyId,
          date: { gte: rangeStart, lte: rangeEnd },
          curriculumEntry: { curriculumVersion: { is: { studyMode: calendar.studyMode } } },
        },
      });
    }),
  );

  return calendars.map((calendar, index) => ({
    templateCount: templateCounts.get(`${scopeKey(calendar)}|${calendar.facultyId}`) ?? 0,
    entryCount: entryCounts[index] ?? 0,
  }));
}

function weeksBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / (7 * 24 * 60 * 60 * 1000)));
}

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    // Dziekanat widzi wylacznie swoj wydzial (wczesniej takze kalendarze ogolnouczelniane,
    // bo byly jego fallbackiem). Konto bez przypisanego wydzialu nie ma czego ogladac —
    // pusta lista jest tu poprawna odpowiedzia, nie bledem.
    const myFacultyId =
      req.user!.role === 'DEAN_OFFICE' ? await getCallerFacultyId(req.user!.id) : null;
    if (req.user!.role === 'DEAN_OFFICE' && !myFacultyId) {
      res.json({ data: [] });
      return;
    }

    const data = await prisma.semesterCalendar.findMany({
      where: myFacultyId ? { facultyId: myFacultyId } : {},
      include: calendarInclude,
      // Rok + typ semestru zostawialy remis miedzy trybami studiow i wydzialami.
      // Czworka [academicYear, semesterType, studyMode, facultyId] to klucz unikalny.
      orderBy: [{ academicYear: 'asc' }, { semesterType: 'asc' }, { studyMode: 'asc' }, { facultyId: 'asc' }],
    });

    // Kalendarz sam z siebie nie mowi, co od niego zalezy — bez tego edycja dat i usuwanie
    // odbywaly sie na slepo (skrocenie zakresu konczylo sie dopiero bledem 409 z serwera).
    const usage = await buildUsage(data);
    res.json({ data: data.map((calendar, index) => ({ ...calendar, ...usage[index] })) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

/**
 * Zakladanie kalendarza. Kazdy wiersz nalezy do wydzialu, wiec wspolne daty dla calej
 * uczelni to po prostu wiele wierszy naraz (`allFaculties`) — jeden gest w UI, ale
 * kazdy wydzial ma potem wlasny, jawny i osobno edytowalny wpis.
 *
 * Wydzialy, ktore juz maja kalendarz dla tej czworki, sa pomijane (`skipDuplicates`) —
 * zalozenie hurtowe nie moze po cichu nadpisac dat ustawionych recznie przez dziekanat.
 */
export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { academicYear, semesterType, studyMode, startDate, endDate, facultyId, allFaculties } =
      req.body as {
        academicYear?: string;
        semesterType?: SemesterType;
        studyMode?: StudyMode;
        startDate?: string;
        endDate?: string;
        facultyId?: string;
        allFaculties?: boolean;
      };
    if (!academicYear || !semesterType || !studyMode || !startDate || !endDate) {
      res.status(400).json({ error: 'Brakujace wymagane pola' });
      return;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      res.status(400).json({ error: 'Nieprawidlowy format daty' });
      return;
    }
    if (start >= end) {
      res.status(400).json({ error: 'Data poczatku musi byc wczesniejsza niz data konca' });
      return;
    }

    // Dziekanat zaklada wylacznie swoj wydzial i nie ma dostepu do wariantu hurtowego.
    const isDeanOffice = req.user!.role === 'DEAN_OFFICE';
    const ownFacultyId = isDeanOffice ? await getCallerFacultyId(req.user!.id) : null;
    if (isDeanOffice && !ownFacultyId) {
      res.status(403).json({ error: 'Konto dziekanatu bez przypisanego wydzialu' });
      return;
    }

    const targets = isDeanOffice
      ? [ownFacultyId!]
      : allFaculties
        ? (await prisma.faculty.findMany({ select: { id: true } })).map((faculty) => faculty.id)
        : facultyId
          ? [facultyId]
          : [];
    if (targets.length === 0) {
      res.status(400).json({
        error: allFaculties ? 'Brak wydzialow w systemie' : 'Kalendarz wymaga wskazania wydzialu',
      });
      return;
    }

    const shared = {
      academicYear,
      semesterType,
      studyMode,
      startDate: start,
      endDate: end,
      teachingWeeks: weeksBetween(start, end),
    };

    if (targets.length > 1) {
      const { count } = await prisma.semesterCalendar.createMany({
        data: targets.map((id) => ({ ...shared, facultyId: id })),
        skipDuplicates: true,
      });
      const skipped = targets.length - count;
      res.status(201).json({
        data: null,
        message:
          `Kalendarz zalozony dla ${count} wydzialow` +
          `${skipped > 0 ? ` (${skipped} pominieto — maja juz wlasny)` : ''}`,
      });
      return;
    }

    const data = await prisma.semesterCalendar.create({
      data: { ...shared, facultyId: targets[0]! },
      include: calendarInclude,
    });
    res.status(201).json({ data, message: 'Kalendarz semestru utworzony' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Kalendarz dla tego semestru, trybu i wydzialu juz istnieje' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { startDate, endDate } = req.body as { startDate?: string; endDate?: string };
    const current = await prisma.semesterCalendar.findUnique({ where: { id: req.params.id } });
    if (!current) {
      res.status(404).json({ error: 'Kalendarz nie znaleziony' });
      return;
    }
    if (req.user!.role === 'DEAN_OFFICE') {
      const myFacultyId = await getCallerFacultyId(req.user!.id);
      if (!myFacultyId || current.facultyId !== myFacultyId) {
        res.status(403).json({ error: 'Mozesz edytowac tylko kalendarz swojego wydzialu' });
        return;
      }
    }

    const newStart = startDate ? new Date(startDate) : current.startDate;
    const newEnd = endDate ? new Date(endDate) : current.endDate;
    if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
      res.status(400).json({ error: 'Nieprawidlowy format daty' });
      return;
    }
    if (newStart >= newEnd) {
      res.status(400).json({ error: 'Data poczatku musi byc wczesniejsza niz data konca' });
      return;
    }

    // Nie pozwol skrocic semestru, jesli zostana zajecia poza nowym zakresem. Patrzymy
    // wylacznie na wlasny wydzial i wlasny tryb studiow (tryb przez siatke — termin go
    // nie zna): drugi tryb ma wlasny kalendarz i granice, wiec nie ma prawa blokowac tego.
    const shrinkingStart = newStart > current.startDate;
    const shrinkingEnd = newEnd < current.endDate;
    if (shrinkingStart || shrinkingEnd) {
      const cutEntry = await prisma.scheduleEntry.findFirst({
        where: {
          status: { not: 'CANCELLED' },
          curriculumEntry: { curriculumVersion: { is: { studyMode: current.studyMode } } },
          facultyId: current.facultyId,
          OR: [
            ...(shrinkingStart ? [{ date: { gte: current.startDate, lt: newStart } }] : []),
            ...(shrinkingEnd ? [{ date: { gt: newEnd, lte: current.endDate } }] : []),
          ],
        },
      });
      if (cutEntry) {
        res.status(409).json({ error: 'Nie mozna skrocic semestru — istnieja zajecia poza nowym zakresem dat' });
        return;
      }
    }

    const data = await prisma.semesterCalendar.update({
      where: { id: req.params.id },
      data: { startDate: newStart, endDate: newEnd, teachingWeeks: weeksBetween(newStart, newEnd) },
      include: calendarInclude,
    });
    res.json({ data, message: 'Kalendarz zaktualizowany' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Kalendarz nie znaleziony' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const current = await prisma.semesterCalendar.findUnique({ where: { id: req.params.id } });
    if (!current) {
      res.status(404).json({ error: 'Kalendarz nie znaleziony' });
      return;
    }
    if (req.user!.role === 'DEAN_OFFICE') {
      const myFacultyId = await getCallerFacultyId(req.user!.id);
      if (!myFacultyId || current.facultyId !== myFacultyId) {
        res.status(403).json({ error: 'Mozesz usuwac tylko kalendarz swojego wydzialu' });
        return;
      }
    }
    await prisma.semesterCalendar.delete({ where: { id: req.params.id } });
    res.json({ message: 'Kalendarz usuniety' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Kalendarz nie znaleziony' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
