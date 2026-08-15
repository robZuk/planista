import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';

export const getAll = asyncHandler(async (req, res) => {
  const { facultyId } = req.query;
  const data = await prisma.fieldOfStudy.findMany({
    where: facultyId ? { facultyId: String(facultyId) } : undefined,
    include: { faculty: true },
    // Nazwa kierunku jest unikalna dopiero w parze z wydzialem ([name, facultyId]) —
    // patrz analogiczny komentarz w specializations.controller.
    orderBy: [{ name: 'asc' }, { faculty: { name: 'asc' } }, { id: 'asc' }],
  });
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const { name, shortName, facultyId } = req.body as {
    name: string;
    shortName: string;
    facultyId: string;
  };
  const data = await prisma.fieldOfStudy.create({ data: { name, shortName, facultyId } });
  res.status(201).json({ data, message: 'Kierunek utworzony' });
});

export const remove = asyncHandler(async (req, res) => {
  const field = await prisma.fieldOfStudy.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { specializations: true, studentGroups: true } } },
  });
  if (!field) throw new AppError(404, 'Kierunek nie znaleziony');
  if (field._count.specializations > 0) {
    throw new AppError(409, 'Nie mozna usunac kierunku z przypisanymi specjalnosciami');
  }
  if (field._count.studentGroups > 0) {
    throw new AppError(409, 'Nie mozna usunac kierunku z przypisanymi grupami studenckimi');
  }
  await prisma.fieldOfStudy.delete({ where: { id: req.params.id } });
  res.json({ message: 'Kierunek usuniety' });
});
