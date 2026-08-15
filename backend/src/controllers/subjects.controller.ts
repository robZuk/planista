import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';

export const getAll = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const data = await prisma.subject.findMany({
    where: search ? { name: { contains: String(search), mode: 'insensitive' } } : undefined,
    orderBy: { name: 'asc' },
  });
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const { name, code } = req.body as { name: string; code?: string };
  const data = await prisma.subject.create({ data: { name, code: code || undefined } });
  res.status(201).json({ data, message: 'Przedmiot utworzony' });
});

export const remove = asyncHandler(async (req, res) => {
  const subject = await prisma.subject.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { entries: true } } },
  });
  if (!subject) throw new AppError(404, 'Przedmiot nie znaleziony');
  if (subject._count.entries > 0) {
    throw new AppError(409, 'Nie mozna usunac przedmiotu uzywanego w siatce godzin');
  }
  await prisma.subject.delete({ where: { id: req.params.id } });
  res.json({ message: 'Przedmiot usuniety' });
});
