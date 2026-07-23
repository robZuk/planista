import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isNotFoundError, isUniqueConstraintError } from '../lib/prismaErrors';

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const { from, to } = req.query;
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(String(from));
    if (to) dateFilter.lte = new Date(String(to));
    const data = await prisma.publicHoliday.findMany({
      where: Object.keys(dateFilter).length ? { date: dateFilter } : {},
      orderBy: { date: 'asc' },
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { date, name } = req.body as { date?: string; name?: string };
    if (!date || !name) {
      res.status(400).json({ error: 'Brakujace wymagane pola: date, name' });
      return;
    }
    const data = await prisma.publicHoliday.create({ data: { date: new Date(date), name } });
    res.status(201).json({ data, message: 'Dzien wolny dodany' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Ten dzien jest juz oznaczony jako wolny' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    await prisma.publicHoliday.delete({ where: { id: req.params.id } });
    res.json({ message: 'Dzien wolny usuniety' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Dzien wolny nie znaleziony' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
