import type { Request, Response } from 'express';
import type { SemesterType, StudyMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isNotFoundError, isUniqueConstraintError } from '../lib/prismaErrors';

function weeksBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / (7 * 24 * 60 * 60 * 1000)));
}

export async function getAll(_req: Request, res: Response): Promise<void> {
  try {
    const data = await prisma.semesterCalendar.findMany({
      // Rok + typ semestru zostawialy remis miedzy trybami studiow. Trojka
      // [academicYear, semesterType, studyMode] to klucz unikalny kalendarza,
      // wiec po dolozeniu trybu remis jest juz niemozliwy.
      orderBy: [{ academicYear: 'asc' }, { semesterType: 'asc' }, { studyMode: 'asc' }],
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { academicYear, semesterType, studyMode, startDate, endDate } = req.body as {
      academicYear?: string;
      semesterType?: SemesterType;
      studyMode?: StudyMode;
      startDate?: string;
      endDate?: string;
    };
    if (!academicYear || !semesterType || !studyMode || !startDate || !endDate) {
      res.status(400).json({ error: 'Brakujace wymagane pola' });
      return;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const data = await prisma.semesterCalendar.create({
      data: { academicYear, semesterType, studyMode, startDate: start, endDate: end, teachingWeeks: weeksBetween(start, end) },
    });
    res.status(201).json({ data, message: 'Kalendarz semestru utworzony' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Kalendarz dla tego semestru i trybu juz istnieje' });
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
    const newStart = startDate ? new Date(startDate) : current.startDate;
    const newEnd = endDate ? new Date(endDate) : current.endDate;

    // Nie pozwol skrocic semestru, jesli zostana zajecia poza nowym zakresem.
    const shrinkingStart = newStart > current.startDate;
    const shrinkingEnd = newEnd < current.endDate;
    if (shrinkingStart || shrinkingEnd) {
      const cutEntry = await prisma.scheduleEntry.findFirst({
        where: {
          status: { not: 'CANCELLED' },
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
