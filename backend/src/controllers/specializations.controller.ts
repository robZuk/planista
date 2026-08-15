import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';

export const getAll = asyncHandler(async (req, res) => {
  const { fieldOfStudyId } = req.query;
  const data = await prisma.specialization.findMany({
    where: fieldOfStudyId ? { fieldOfStudyId: String(fieldOfStudyId) } : undefined,
    include: { fieldOfStudy: { include: { faculty: true } } },
    // Nazwa specjalnosci jest unikalna dopiero w parze z kierunkiem ([name, fieldOfStudyId]),
    // wiec sama nie porzadkuje listy jednoznacznie. Bez dosortowania dwie specjalnosci
    // o tej samej nazwie zamienialyby sie miejscami po edycji dowolnej z nich.
    orderBy: [{ name: 'asc' }, { fieldOfStudy: { name: 'asc' } }, { id: 'asc' }],
  });
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const { name, shortName, fieldOfStudyId } = req.body as {
    name: string;
    shortName: string;
    fieldOfStudyId: string;
  };
  const data = await prisma.specialization.create({ data: { name, shortName, fieldOfStudyId } });
  res.status(201).json({ data, message: 'Specjalnosc utworzona' });
});

export const remove = asyncHandler(async (req, res) => {
  const spec = await prisma.specialization.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { curriculumVersions: true, studentGroups: true } } },
  });
  if (!spec) throw new AppError(404, 'Specjalnosc nie znaleziona');
  if (spec._count.curriculumVersions > 0) {
    throw new AppError(409, 'Nie mozna usunac specjalnosci z przypisanymi wersjami planu');
  }
  if (spec._count.studentGroups > 0) {
    throw new AppError(409, 'Nie mozna usunac specjalnosci z przypisanymi grupami studenckimi');
  }
  await prisma.specialization.delete({ where: { id: req.params.id } });
  res.json({ message: 'Specjalnosc usunieta' });
});
