import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isUniqueConstraintError, isNotFoundError, isForeignKeyError } from '../lib/prismaErrors';

export async function getAll(_req: Request, res: Response): Promise<void> {
  try {
    const data = await prisma.faculty.findMany({ orderBy: { name: 'asc' } });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const data = await prisma.faculty.findUnique({
      where: { id: req.params.id },
      include: { fieldsOfStudy: true, buildings: true, instructors: true },
    });
    if (!data) {
      res.status(404).json({ error: 'Wydzial nie znaleziony' });
      return;
    }
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, shortName } = req.body as { name?: string; shortName?: string };
    if (!name || !shortName) {
      res.status(400).json({ error: 'Pola name i shortName sa wymagane' });
      return;
    }
    const data = await prisma.faculty.create({ data: { name, shortName } });
    res.status(201).json({ data, message: 'Wydzial utworzony' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Wydzial o tej nazwie lub skrocie juz istnieje' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { name, shortName } = req.body as { name?: string; shortName?: string };
    const data = await prisma.faculty.update({
      where: { id: req.params.id },
      data: { name, shortName },
    });
    res.json({ data, message: 'Wydzial zaktualizowany' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Wydzial nie znaleziony' });
      return;
    }
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Nazwa lub skrot juz zajete' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const faculty = await prisma.faculty.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { fieldsOfStudy: true, buildings: true, instructors: true } } },
    });
    if (!faculty) {
      res.status(404).json({ error: 'Wydzial nie znaleziony' });
      return;
    }
    if (faculty._count.fieldsOfStudy > 0) {
      res.status(409).json({ error: 'Nie mozna usunac wydzialu z przypisanymi kierunkami' });
      return;
    }
    if (faculty._count.buildings > 0 || faculty._count.instructors > 0) {
      res.status(409).json({ error: 'Nie mozna usunac wydzialu z przypisanymi budynkami lub prowadzacymi' });
      return;
    }
    await prisma.faculty.delete({ where: { id: req.params.id } });
    res.json({ message: 'Wydzial usuniety' });
  } catch (error) {
    if (isForeignKeyError(error)) {
      res.status(409).json({ error: 'Nie mozna usunac wydzialu — jest jeszcze uzywany' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
