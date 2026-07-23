import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isUniqueConstraintError } from '../lib/prismaErrors';

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const { search } = req.query;
    const data = await prisma.subject.findMany({
      where: search ? { name: { contains: String(search), mode: 'insensitive' } } : undefined,
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
    const { name, code } = req.body as { name?: string; code?: string };
    if (!name) {
      res.status(400).json({ error: 'Pole name jest wymagane' });
      return;
    }
    const data = await prisma.subject.create({ data: { name, code: code || undefined } });
    res.status(201).json({ data, message: 'Przedmiot utworzony' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Przedmiot o tej nazwie lub kodzie juz istnieje' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const subject = await prisma.subject.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { entries: true } } },
    });
    if (!subject) {
      res.status(404).json({ error: 'Przedmiot nie znaleziony' });
      return;
    }
    if (subject._count.entries > 0) {
      res.status(409).json({ error: 'Nie mozna usunac przedmiotu uzywanego w siatce godzin' });
      return;
    }
    await prisma.subject.delete({ where: { id: req.params.id } });
    res.json({ message: 'Przedmiot usuniety' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
