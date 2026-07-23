import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isUniqueConstraintError, isNotFoundError, isForeignKeyError } from '../lib/prismaErrors';

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const { facultyId } = req.query;
    const data = await prisma.instructor.findMany({
      where: facultyId ? { facultyId: String(facultyId) } : undefined,
      include: { faculty: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const data = await prisma.instructor.findUnique({
      where: { id: req.params.id },
      include: { faculty: true },
    });
    if (!data) {
      res.status(404).json({ error: 'Prowadzacy nie znaleziony' });
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
    const { firstName, lastName, email, title, facultyId } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      title?: string;
      facultyId?: string;
    };
    if (!firstName || !lastName || !email) {
      res.status(400).json({ error: 'Pola firstName, lastName i email sa wymagane' });
      return;
    }
    const data = await prisma.instructor.create({
      data: { firstName, lastName, email, title, facultyId },
    });
    res.status(201).json({ data, message: 'Prowadzacy utworzony' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Prowadzacy z tym e-mailem juz istnieje' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { firstName, lastName, email, title, facultyId } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      title?: string;
      facultyId?: string;
    };
    const data = await prisma.instructor.update({
      where: { id: req.params.id },
      data: { firstName, lastName, email, title, facultyId },
    });
    res.json({ data, message: 'Prowadzacy zaktualizowany' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Prowadzacy nie znaleziony' });
      return;
    }
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'E-mail juz zajety' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const instructor = await prisma.instructor.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { templateEntries: true, scheduleEntries: true } } },
    });
    if (!instructor) {
      res.status(404).json({ error: 'Prowadzacy nie znaleziony' });
      return;
    }
    if (instructor._count.templateEntries > 0 || instructor._count.scheduleEntries > 0) {
      res.status(409).json({ error: 'Nie mozna usunac prowadzacego przypisanego do planu zajec' });
      return;
    }
    await prisma.instructor.delete({ where: { id: req.params.id } });
    res.json({ message: 'Prowadzacy usuniety' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Prowadzacy nie znaleziony' });
      return;
    }
    if (isForeignKeyError(error)) {
      res.status(409).json({ error: 'Nie mozna usunac prowadzacego — jest jeszcze uzywany' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
