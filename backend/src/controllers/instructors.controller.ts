import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';

export const getAll = asyncHandler(async (req, res) => {
  const { facultyId } = req.query;
  const data = await prisma.instructor.findMany({
    where: facultyId ? { facultyId: String(facultyId) } : undefined,
    include: { faculty: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  res.json({ data });
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await prisma.instructor.findUnique({
    where: { id: req.params.id },
    include: { faculty: true },
  });
  if (!data) throw new AppError(404, 'Prowadzacy nie znaleziony');
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, title, facultyId } = req.body as {
    firstName: string;
    lastName: string;
    email: string;
    title?: string;
    facultyId?: string;
  };
  const data = await prisma.instructor.create({
    data: { firstName, lastName, email, title, facultyId },
  });
  res.status(201).json({ data, message: 'Prowadzacy utworzony' });
});

export const update = asyncHandler(async (req, res) => {
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
});

export const remove = asyncHandler(async (req, res) => {
  const instructor = await prisma.instructor.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { templateEntries: true, scheduleEntries: true } } },
  });
  if (!instructor) throw new AppError(404, 'Prowadzacy nie znaleziony');
  if (instructor._count.templateEntries > 0 || instructor._count.scheduleEntries > 0) {
    throw new AppError(409, 'Nie mozna usunac prowadzacego przypisanego do planu zajec');
  }
  await prisma.instructor.delete({ where: { id: req.params.id } });
  res.json({ message: 'Prowadzacy usuniety' });
});
