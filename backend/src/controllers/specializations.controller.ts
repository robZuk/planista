import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isUniqueConstraintError, isForeignKeyError } from '../lib/prismaErrors';

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const { fieldOfStudyId } = req.query;
    const data = await prisma.specialization.findMany({
      where: fieldOfStudyId ? { fieldOfStudyId: String(fieldOfStudyId) } : undefined,
      include: { fieldOfStudy: { include: { faculty: true } } },
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
    const { name, shortName, fieldOfStudyId } = req.body as {
      name?: string;
      shortName?: string;
      fieldOfStudyId?: string;
    };
    if (!name || !shortName || !fieldOfStudyId) {
      res.status(400).json({ error: 'Pola name, shortName i fieldOfStudyId sa wymagane' });
      return;
    }
    const data = await prisma.specialization.create({ data: { name, shortName, fieldOfStudyId } });
    res.status(201).json({ data, message: 'Specjalnosc utworzona' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Specjalnosc o tej nazwie juz istnieje w tym kierunku' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const spec = await prisma.specialization.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { curriculumVersions: true, studentGroups: true } } },
    });
    if (!spec) {
      res.status(404).json({ error: 'Specjalnosc nie znaleziona' });
      return;
    }
    if (spec._count.curriculumVersions > 0) {
      res.status(409).json({ error: 'Nie mozna usunac specjalnosci z przypisanymi wersjami planu' });
      return;
    }
    if (spec._count.studentGroups > 0) {
      res.status(409).json({ error: 'Nie mozna usunac specjalnosci z przypisanymi grupami studenckimi' });
      return;
    }
    await prisma.specialization.delete({ where: { id: req.params.id } });
    res.json({ message: 'Specjalnosc usunieta' });
  } catch (error) {
    if (isForeignKeyError(error)) {
      res.status(409).json({ error: 'Nie mozna usunac specjalnosci — jest jeszcze uzywana' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
