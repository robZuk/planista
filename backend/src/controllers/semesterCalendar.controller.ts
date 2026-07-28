import type { Request, Response } from 'express';
import type { SemesterType, StudyMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isNotFoundError, isUniqueConstraintError } from '../lib/prismaErrors';
import { getCallerFacultyId } from '../lib/callerFaculty';

const calendarInclude = {
  faculty: { select: { id: true, name: true, shortName: true } },
};

function weeksBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / (7 * 24 * 60 * 60 * 1000)));
}

/**
 * Wydzial kalendarza: dziekanat zawsze pracuje na swoim, admin na wskazanym
 * (albo na ogolnouczelnianym, gdy poda null). Zwraca `false`, gdy konto dziekanatu
 * nie ma przypisanego wydzialu — wtedy nie ma czego zapisac.
 */
async function resolveOwnerFacultyId(
  req: Request,
  requested: string | null | undefined,
): Promise<string | null | false> {
  if (req.user!.role !== 'DEAN_OFFICE') return requested ?? null;
  const own = await getCallerFacultyId(req.user!.id);
  return own ?? false;
}

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    // Dziekanat widzi swoj wydzial i kalendarze ogolnouczelniane (te sa jego fallbackiem).
    const myFacultyId =
      req.user!.role === 'DEAN_OFFICE' ? await getCallerFacultyId(req.user!.id) : null;

    const data = await prisma.semesterCalendar.findMany({
      where:
        req.user!.role === 'DEAN_OFFICE'
          ? { OR: [{ facultyId: null }, ...(myFacultyId ? [{ facultyId: myFacultyId }] : [])] }
          : {},
      include: calendarInclude,
      // Rok + typ semestru zostawialy remis miedzy trybami studiow i wydzialami.
      // Czworka [academicYear, semesterType, studyMode, facultyId] to klucz unikalny.
      orderBy: [{ academicYear: 'asc' }, { semesterType: 'asc' }, { studyMode: 'asc' }, { facultyId: 'asc' }],
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { academicYear, semesterType, studyMode, startDate, endDate, facultyId } = req.body as {
      academicYear?: string;
      semesterType?: SemesterType;
      studyMode?: StudyMode;
      startDate?: string;
      endDate?: string;
      facultyId?: string | null;
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

    const owner = await resolveOwnerFacultyId(req, facultyId);
    if (owner === false) {
      res.status(403).json({ error: 'Konto dziekanatu bez przypisanego wydzialu' });
      return;
    }

    // W Postgresie NULL != NULL, wiec unique nie zlapie duplikatu kalendarza
    // ogolnouczelnianego — sprawdzamy go jawnie.
    if (owner === null) {
      const duplicate = await prisma.semesterCalendar.findFirst({
        where: { academicYear, semesterType, studyMode, facultyId: null },
      });
      if (duplicate) {
        res.status(409).json({ error: 'Kalendarz ogolnouczelniany dla tego semestru i trybu juz istnieje' });
        return;
      }
    }

    const data = await prisma.semesterCalendar.create({
      data: {
        academicYear,
        semesterType,
        studyMode,
        facultyId: owner,
        startDate: start,
        endDate: end,
        teachingWeeks: weeksBetween(start, end),
      },
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
      if (current.facultyId !== myFacultyId) {
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

    // Nie pozwol skrocic semestru, jesli zostana zajecia poza nowym zakresem.
    // Kalendarz wydzialowy patrzy wylacznie na swoj wydzial; ogolnouczelniany na wszystkie.
    const shrinkingStart = newStart > current.startDate;
    const shrinkingEnd = newEnd < current.endDate;
    if (shrinkingStart || shrinkingEnd) {
      const cutEntry = await prisma.scheduleEntry.findFirst({
        where: {
          status: { not: 'CANCELLED' },
          ...(current.facultyId ? { facultyId: current.facultyId } : {}),
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
      if (current.facultyId !== myFacultyId) {
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
