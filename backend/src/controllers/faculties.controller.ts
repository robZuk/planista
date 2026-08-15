import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';

export const getAll = asyncHandler(async (_req, res) => {
  const data = await prisma.faculty.findMany({ orderBy: { name: 'asc' } });
  res.json({ data });
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await prisma.faculty.findUnique({
    where: { id: req.params.id },
    include: { fieldsOfStudy: true, buildings: true, instructors: true },
  });
  if (!data) throw new AppError(404, 'Wydzial nie znaleziony');
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const { name, shortName } = req.body as { name: string; shortName: string };
  const data = await prisma.faculty.create({ data: { name, shortName } });
  res.status(201).json({ data, message: 'Wydzial utworzony' });
});

export const update = asyncHandler(async (req, res) => {
  const { name, shortName } = req.body as { name?: string; shortName?: string };
  const data = await prisma.faculty.update({
    where: { id: req.params.id },
    data: { name, shortName },
  });
  res.json({ data, message: 'Wydzial zaktualizowany' });
});

export const remove = asyncHandler(async (req, res) => {
  const faculty = await prisma.faculty.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { fieldsOfStudy: true, buildings: true, instructors: true } } },
  });
  if (!faculty) throw new AppError(404, 'Wydzial nie znaleziony');
  if (faculty._count.fieldsOfStudy > 0) {
    throw new AppError(409, 'Nie mozna usunac wydzialu z przypisanymi kierunkami');
  }
  if (faculty._count.buildings > 0 || faculty._count.instructors > 0) {
    throw new AppError(409, 'Nie mozna usunac wydzialu z przypisanymi budynkami lub prowadzacymi');
  }
  await prisma.faculty.delete({ where: { id: req.params.id } });
  res.json({ message: 'Wydzial usuniety' });
});
