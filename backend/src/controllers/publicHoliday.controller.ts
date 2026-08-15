import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/asyncHandler';

export const getAll = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = new Date(String(from));
  if (to) dateFilter.lte = new Date(String(to));
  const data = await prisma.publicHoliday.findMany({
    where: Object.keys(dateFilter).length ? { date: dateFilter } : {},
    orderBy: { date: 'asc' },
  });
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const { date, name } = req.body as { date: string; name: string };
  const data = await prisma.publicHoliday.create({ data: { date: new Date(date), name } });
  res.status(201).json({ data, message: 'Dzien wolny dodany' });
});

export const remove = asyncHandler(async (req, res) => {
  // Nieistniejacy rekord -> Prisma P2025 -> errorHandler zwroci 404.
  await prisma.publicHoliday.delete({ where: { id: req.params.id } });
  res.json({ message: 'Dzien wolny usuniety' });
});
