import type { StudyMode, DegreeLevel, AssessmentType, SemesterType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';

// ─── Wersje siatki godzin ────────────────────────────────────

export const getAcademicYears = asyncHandler(async (_req, res) => {
  const rows = await prisma.curriculumVersion.findMany({
    select: { academicYear: true },
    distinct: ['academicYear'],
    orderBy: { academicYear: 'desc' },
  });
  res.json({ data: rows.map((r) => r.academicYear) });
});

export const getVersions = asyncHandler(async (_req, res) => {
  const data = await prisma.curriculumVersion.findMany({
    include: {
      specialization: { include: { fieldOfStudy: { include: { faculty: true } } } },
      _count: { select: { entries: true } },
    },
    // Sam rok akademicki NIE porzadkuje listy jednoznacznie — wszystkie siatki
    // zwykle maja ten sam rok, wiec Postgres zwracal reszte w kolejnosci fizycznej.
    // UPDATE przepisuje wiersz na koniec sterty, wiec po kazdym przelaczeniu
    // "Aktywna" siatka przeskakiwala na dol tabeli. Dosortowanie do pelnego
    // porzadku (id na koncu jako rozstrzygajace) trzyma kolejnosc w miejscu.
    orderBy: [
      { academicYear: 'desc' },
      { specialization: { name: 'asc' } },
      { studyMode: 'asc' },
      { id: 'asc' },
    ],
  });
  res.json({ data });
});

export const createVersion = asyncHandler(async (req, res) => {
  const { academicYear, studyMode, degreeLevel, totalSemesters, specializationId, startSemesterType } =
    req.body as {
      academicYear?: string;
      studyMode?: StudyMode;
      degreeLevel?: DegreeLevel;
      totalSemesters?: number;
      specializationId?: string;
      startSemesterType?: SemesterType;
    };
  if (!academicYear || !studyMode || !degreeLevel || !totalSemesters || !specializationId) {
    throw new AppError(400, 'Wszystkie pola sa wymagane');
  }
  const data = await prisma.curriculumVersion.create({
    data: {
      academicYear,
      studyMode,
      degreeLevel,
      totalSemesters,
      specializationId,
      startSemesterType: startSemesterType ?? 'WINTER',
    },
  });
  res.status(201).json({ data, message: 'Siatka godzin utworzona' });
});

export const updateVersion = asyncHandler(async (req, res) => {
  const { totalSemesters } = req.body as { totalSemesters?: number };
  const data = await prisma.curriculumVersion.update({
    where: { id: req.params.id },
    data: { totalSemesters },
  });
  res.json({ data, message: 'Siatka zaktualizowana' });
});

export const deleteVersion = asyncHandler(async (req, res) => {
  const version = await prisma.curriculumVersion.findUnique({
    where: { id: req.params.id },
    select: { id: true, entries: { select: { id: true } } },
  });
  if (!version) throw new AppError(404, 'Siatka nie znaleziona');
  const entryIds = version.entries.map((e) => e.id);

  await prisma.$transaction([
    prisma.scheduleEntry.deleteMany({ where: { curriculumEntryId: { in: entryIds } } }),
    prisma.scheduleTemplate.deleteMany({ where: { curriculumEntryId: { in: entryIds } } }),
    prisma.curriculumVersion.delete({ where: { id: req.params.id } }),
  ]);

  res.json({ message: 'Siatka usunieta' });
});

// ─── Wpisy siatki (przedmioty w semestrach) ──────────────────

export const getEntries = asyncHandler(async (req, res) => {
  const { semester } = req.query;

  const version = await prisma.curriculumVersion.findUnique({ where: { id: req.params.id } });
  if (!version) throw new AppError(404, 'Siatka nie znaleziona');

  const entries = await prisma.curriculumEntry.findMany({
    where: {
      curriculumVersionId: req.params.id,
      ...(semester ? { semester: Number(semester) } : {}),
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      instructor: { select: { id: true, firstName: true, lastName: true, title: true } },
    },
    orderBy: [{ semester: 'asc' }, { orderInSemester: 'asc' }],
  });

  const semesterMap = new Map<number, typeof entries>();
  for (const entry of entries) {
    if (!semesterMap.has(entry.semester)) semesterMap.set(entry.semester, []);
    semesterMap.get(entry.semester)!.push(entry);
  }

  const semesters = Array.from(semesterMap.entries()).map(([sem, semEntries]) => ({
    semester: sem,
    totalEcts: semEntries.reduce((sum, e) => sum + e.ects, 0),
    entries: semEntries.map((e) => ({
      id: e.id,
      orderInSemester: e.orderInSemester,
      subject: e.subject,
      instructor: e.instructor,
      hoursLecture: e.hoursLecture,
      hoursExercise: e.hoursExercise,
      hoursLab: e.hoursLab,
      hoursProject: e.hoursProject,
      hoursSeminar: e.hoursSeminar,
      totalHours: e.hoursLecture + e.hoursExercise + e.hoursLab + e.hoursProject + e.hoursSeminar,
      ects: e.ects,
      assessmentType: e.assessmentType,
    })),
  }));

  res.json({ data: { version, semesters } });
});

export const addEntry = asyncHandler(async (req, res) => {
  const {
    subjectId,
    instructorId,
    semester,
    orderInSemester,
    hoursLecture,
    hoursExercise,
    hoursLab,
    hoursProject,
    hoursSeminar,
    ects,
    assessmentType,
  } = req.body as {
    subjectId?: string;
    instructorId?: string;
    semester?: number;
    orderInSemester?: number;
    hoursLecture?: number;
    hoursExercise?: number;
    hoursLab?: number;
    hoursProject?: number;
    hoursSeminar?: number;
    ects?: number;
    assessmentType?: AssessmentType;
  };

  if (!subjectId || !semester || orderInSemester === undefined) {
    throw new AppError(400, 'Pola subjectId, semester i orderInSemester sa wymagane');
  }

  const version = await prisma.curriculumVersion.findUnique({ where: { id: req.params.id } });
  if (!version) throw new AppError(404, 'Siatka nie znaleziona');
  if (semester < 1 || semester > version.totalSemesters) {
    throw new AppError(400, `Semestr musi byc w zakresie 1-${version.totalSemesters} dla tej siatki`);
  }

  const data = await prisma.curriculumEntry.create({
    data: {
      curriculumVersionId: req.params.id,
      subjectId,
      instructorId: instructorId || undefined,
      semester,
      orderInSemester,
      hoursLecture: hoursLecture ?? 0,
      hoursExercise: hoursExercise ?? 0,
      hoursLab: hoursLab ?? 0,
      hoursProject: hoursProject ?? 0,
      hoursSeminar: hoursSeminar ?? 0,
      ects: ects ?? 0,
      assessmentType: assessmentType ?? 'CREDIT',
    },
  });
  res.status(201).json({ data, message: 'Przedmiot dodany do siatki' });
});

export const updateEntry = asyncHandler(async (req, res) => {
  const {
    hoursLecture,
    hoursExercise,
    hoursLab,
    hoursProject,
    hoursSeminar,
    ects,
    assessmentType,
    instructorId,
  } = req.body as {
    hoursLecture?: number;
    hoursExercise?: number;
    hoursLab?: number;
    hoursProject?: number;
    hoursSeminar?: number;
    ects?: number;
    assessmentType?: AssessmentType;
    instructorId?: string | null;
  };
  const data = await prisma.curriculumEntry.update({
    where: { id: req.params.id },
    data: {
      hoursLecture,
      hoursExercise,
      hoursLab,
      hoursProject,
      hoursSeminar,
      ects,
      assessmentType,
      instructorId: instructorId === null ? null : instructorId || undefined,
    },
  });
  res.json({ data, message: 'Wpis zaktualizowany' });
});

export const deleteEntry = asyncHandler(async (req, res) => {
  const entry = await prisma.curriculumEntry.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { templateEntries: true, scheduleEntries: true } } },
  });
  if (!entry) throw new AppError(404, 'Wpis nie znaleziony');
  if (entry._count.templateEntries > 0 || entry._count.scheduleEntries > 0) {
    throw new AppError(409, 'Nie mozna usunac wpisu uzywanego w planie zajec. Usun najpierw powiazany plan.');
  }
  await prisma.curriculumEntry.delete({ where: { id: req.params.id } });
  res.json({ message: 'Wpis usuniety' });
});
