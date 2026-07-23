import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isUniqueConstraintError, isForeignKeyError } from '../lib/prismaErrors';

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const { facultyId } = req.query;
    const data = await prisma.fieldOfStudy.findMany({
      where: facultyId ? { facultyId: String(facultyId) } : undefined,
      include: { faculty: true },
      orderBy: { name: 'asc' },
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, shortName, facultyId } = req.body as {
      name?: string;
      shortName?: string;
      facultyId?: string;
    };
    if (!name || !shortName || !facultyId) {
      res.status(400).json({ error: 'Pola name, shortName i facultyId sa wymagane' });
      return;
    }
    const data = await prisma.fieldOfStudy.create({ data: { name, shortName, facultyId } });
    res.status(201).json({ data, message: 'Kierunek utworzony' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Kierunek o tej nazwie juz istnieje w tym wydziale' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const field = await prisma.fieldOfStudy.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { specializations: true, studentGroups: true } } },
    });
    if (!field) {
      res.status(404).json({ error: 'Kierunek nie znaleziony' });
      return;
    }
    if (field._count.specializations > 0) {
      res.status(409).json({ error: 'Nie mozna usunac kierunku z przypisanymi specjalnosciami' });
      return;
    }
    if (field._count.studentGroups > 0) {
      res.status(409).json({ error: 'Nie mozna usunac kierunku z przypisanymi grupami studenckimi' });
      return;
    }
    await prisma.fieldOfStudy.delete({ where: { id: req.params.id } });
    res.json({ message: 'Kierunek usuniety' });
  } catch (error) {
    if (isForeignKeyError(error)) {
      res.status(409).json({ error: 'Nie mozna usunac kierunku — jest jeszcze uzywany' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
