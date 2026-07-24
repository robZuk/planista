import type { Request, Response } from 'express';
import type { StudyMode, DegreeLevel, AssessmentType, SemesterType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isNotFoundError, isUniqueConstraintError, isForeignKeyError } from '../lib/prismaErrors';

// ─── Wersje siatki godzin ────────────────────────────────────

export async function getAcademicYears(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await prisma.curriculumVersion.findMany({
      select: { academicYear: true },
      distinct: ['academicYear'],
      orderBy: { academicYear: 'desc' },
    });
    res.json({ data: rows.map((r) => r.academicYear) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function getVersions(_req: Request, res: Response): Promise<void> {
  try {
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function createVersion(req: Request, res: Response): Promise<void> {
  try {
    const {
      academicYear,
      studyMode,
      degreeLevel,
      totalSemesters,
      specializationId,
      startSemesterType,
    } = req.body as {
      academicYear?: string;
      studyMode?: StudyMode;
      degreeLevel?: DegreeLevel;
      totalSemesters?: number;
      specializationId?: string;
      startSemesterType?: SemesterType;
    };
    if (!academicYear || !studyMode || !degreeLevel || !totalSemesters || !specializationId) {
      res.status(400).json({ error: 'Wszystkie pola sa wymagane' });
      return;
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
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Siatka dla tej specjalnosci, roku i trybu juz istnieje' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function updateVersion(req: Request, res: Response): Promise<void> {
  try {
    const { totalSemesters, isActive } = req.body as { totalSemesters?: number; isActive?: boolean };
    const data = await prisma.curriculumVersion.update({
      where: { id: req.params.id },
      data: { totalSemesters, isActive },
    });
    res.json({ data, message: 'Siatka zaktualizowana' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Siatka nie znaleziona' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function deleteVersion(req: Request, res: Response): Promise<void> {
  try {
    const version = await prisma.curriculumVersion.findUnique({
      where: { id: req.params.id },
      select: { id: true, entries: { select: { id: true } } },
    });
    if (!version) {
      res.status(404).json({ error: 'Siatka nie znaleziona' });
      return;
    }
    const entryIds = version.entries.map((e) => e.id);

    await prisma.$transaction([
      prisma.scheduleEntry.deleteMany({ where: { curriculumEntryId: { in: entryIds } } }),
      prisma.scheduleTemplate.deleteMany({ where: { curriculumEntryId: { in: entryIds } } }),
      prisma.curriculumVersion.delete({ where: { id: req.params.id } }),
    ]);

    res.json({ message: 'Siatka usunieta' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Siatka nie znaleziona' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// ─── Wpisy siatki (przedmioty w semestrach) ──────────────────

export async function getEntries(req: Request, res: Response): Promise<void> {
  try {
    const { semester } = req.query;

    const version = await prisma.curriculumVersion.findUnique({ where: { id: req.params.id } });
    if (!version) {
      res.status(404).json({ error: 'Siatka nie znaleziona' });
      return;
    }

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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function addEntry(req: Request, res: Response): Promise<void> {
  try {
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
      res.status(400).json({ error: 'Pola subjectId, semester i orderInSemester sa wymagane' });
      return;
    }

    const version = await prisma.curriculumVersion.findUnique({ where: { id: req.params.id } });
    if (!version) {
      res.status(404).json({ error: 'Siatka nie znaleziona' });
      return;
    }
    if (semester < 1 || semester > version.totalSemesters) {
      res.status(400).json({
        error: `Semestr musi byc w zakresie 1-${version.totalSemesters} dla tej siatki`,
      });
      return;
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
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Ten przedmiot jest juz w siatce dla tego semestru' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function updateEntry(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Wpis nie znaleziony' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function deleteEntry(req: Request, res: Response): Promise<void> {
  try {
    const entry = await prisma.curriculumEntry.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { templateEntries: true, scheduleEntries: true } } },
    });
    if (!entry) {
      res.status(404).json({ error: 'Wpis nie znaleziony' });
      return;
    }
    if (entry._count.templateEntries > 0 || entry._count.scheduleEntries > 0) {
      res.status(409).json({
        error: 'Nie mozna usunac wpisu uzywanego w planie zajec. Usun najpierw powiazany plan.',
      });
      return;
    }
    await prisma.curriculumEntry.delete({ where: { id: req.params.id } });
    res.json({ message: 'Wpis usuniety' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Wpis nie znaleziony' });
      return;
    }
    if (isForeignKeyError(error)) {
      res.status(409).json({ error: 'Nie mozna usunac wpisu — jest jeszcze uzywany w planie zajec' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
