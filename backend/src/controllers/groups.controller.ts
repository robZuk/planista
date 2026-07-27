import type { Request, Response } from 'express';
import type { GroupType, StudyMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isNotFoundError, isUniqueConstraintError, isForeignKeyError } from '../lib/prismaErrors';
import { generateGroupName } from '../lib/groupNaming';

// GET /api/groups
export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const { fieldOfStudyId, specializationId, studyYear, academicYear, studyMode } = req.query;
    const data = await prisma.studentGroup.findMany({
      where: {
        ...(fieldOfStudyId ? { fieldOfStudyId: String(fieldOfStudyId) } : {}),
        ...(specializationId ? { specializationId: String(specializationId) } : {}),
        ...(studyYear ? { studyYear: Number(studyYear) } : {}),
        ...(academicYear ? { academicYear: String(academicYear) } : {}),
        ...(studyMode ? { studyMode: studyMode as StudyMode } : {}),
      },
      include: {
        subGroups: { include: { subGroups: true } },
        preferredRoom: { include: { building: { select: { name: true } } } },
      },
      orderBy: [{ studyYear: 'asc' }, { type: 'asc' }, { name: 'asc' }],
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// GET /api/groups/:id
export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const data = await prisma.studentGroup.findUnique({
      where: { id: req.params.id },
      include: {
        subGroups: { include: { subGroups: true } },
        parentGroup: true,
        preferredRoom: { include: { building: { select: { name: true } } } },
        fieldOfStudy: { select: { name: true, shortName: true } },
        specialization: { select: { name: true, shortName: true } },
      },
    });
    if (!data) {
      res.status(404).json({ error: 'Grupa nie znaleziona' });
      return;
    }
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

type ProposalEntry = {
  name: string;
  type: GroupType;
  size: number;
  parentName: string | null;
  studyYear: number;
};

/**
 * Generuje propozycje grup wg parametrow podanych PRZEZ DZIEKANAT — dziekanat
 * decyduje ile ma byc grup cwiczeniowych i ile podgrup laboratoryjnych na
 * kazda z nich (nie wyliczamy tego automatycznie z pojemnosci sal — to swiadoma
 * decyzja: dziekanat zna realia lepiej niz sama pojemnosc najwiekszej sali).
 *
 * - LECTURE: zawsze dokladnie 1 grupa, cala liczba studentow.
 * - EXERCISE: `exerciseGroupCount` grup, studenci podzieleni rowno.
 * - PROJECT / SEMINAR: tyle samo grup co EXERCISE (typowo dziela sie tak samo);
 *   rodzicem jest wyklad, nie cwiczenia.
 * - LAB: `labPerExercise` podgrup NA KAZDA grupe cwiczeniowa (dziecko cwiczen).
 */
function generateForStudyYear(
  studyYear: number,
  groupPrefix: string,
  totalStudents: number,
  classTypes: Set<GroupType>,
  exerciseGroupCount: number,
  labPerExercise: number,
): ProposalEntry[] {
  const proposal: ProposalEntry[] = [];
  const lectureName = generateGroupName(groupPrefix, studyYear, 'LECTURE', 0);

  if (classTypes.has('LECTURE')) {
    proposal.push({ name: lectureName, type: 'LECTURE', size: totalStudents, parentName: null, studyYear });
  }

  const exerciseCount = classTypes.has('EXERCISE') || classTypes.has('LAB') ? Math.max(1, exerciseGroupCount) : 0;
  const exerciseSize = exerciseCount > 0 ? Math.ceil(totalStudents / exerciseCount) : 0;

  if (classTypes.has('EXERCISE')) {
    for (let i = 0; i < exerciseCount; i++) {
      proposal.push({
        name: generateGroupName(groupPrefix, studyYear, 'EXERCISE', i),
        type: 'EXERCISE',
        size: exerciseSize,
        parentName: lectureName,
        studyYear,
      });
    }
  }

  for (const groupType of ['PROJECT', 'SEMINAR'] as const) {
    if (!classTypes.has(groupType)) continue;
    for (let i = 0; i < exerciseCount; i++) {
      proposal.push({
        name: generateGroupName(groupPrefix, studyYear, groupType, i),
        type: groupType,
        size: exerciseSize,
        parentName: lectureName,
        studyYear,
      });
    }
  }

  if (classTypes.has('LAB')) {
    const labCount = Math.max(1, labPerExercise);
    for (let exerciseIdx = 0; exerciseIdx < exerciseCount; exerciseIdx++) {
      const exerciseName = classTypes.has('EXERCISE')
        ? generateGroupName(groupPrefix, studyYear, 'EXERCISE', exerciseIdx)
        : lectureName;
      for (let labIdx = 0; labIdx < labCount; labIdx++) {
        proposal.push({
          name: generateGroupName(groupPrefix, studyYear, 'LAB', labIdx, exerciseIdx),
          type: 'LAB',
          size: Math.ceil(exerciseSize / labCount),
          parentName: exerciseName,
          studyYear,
        });
      }
    }
  }

  return proposal;
}

// POST /api/groups/generate — generuj propozycje (nie zapisuje)
export async function generate(req: Request, res: Response): Promise<void> {
  try {
    const {
      fieldOfStudyId,
      specializationId,
      studyYear,
      academicYear,
      totalStudents,
      studyMode,
      exerciseGroupCount,
      labPerExercise,
    } = req.body as {
      fieldOfStudyId?: string;
      specializationId?: string;
      studyYear?: number;
      academicYear?: string;
      totalStudents?: number;
      studyMode?: 'FULL_TIME' | 'PART_TIME';
      exerciseGroupCount?: number;
      labPerExercise?: number;
    };

    if (!fieldOfStudyId || !academicYear || !totalStudents || !studyYear) {
      res.status(400).json({ error: 'Brakujace wymagane pola' });
      return;
    }
    if (totalStudents <= 0) {
      res.status(400).json({ error: 'totalStudents musi byc > 0' });
      return;
    }
    if (exerciseGroupCount !== undefined && exerciseGroupCount < 1) {
      res.status(400).json({ error: 'exerciseGroupCount musi byc >= 1' });
      return;
    }
    if (labPerExercise !== undefined && labPerExercise < 1) {
      res.status(400).json({ error: 'labPerExercise musi byc >= 1' });
      return;
    }

    const fieldOfStudy = await prisma.fieldOfStudy.findUnique({
      where: { id: fieldOfStudyId },
      select: { shortName: true, facultyId: true },
    });
    if (!fieldOfStudy) {
      res.status(404).json({ error: 'Kierunek studiow nie znaleziony' });
      return;
    }

    let groupPrefix = fieldOfStudy.shortName;
    if (specializationId) {
      const specialization = await prisma.specialization.findUnique({
        where: { id: specializationId },
        select: { shortName: true },
      });
      if (specialization) groupPrefix = specialization.shortName;
    }
    if (studyMode === 'PART_TIME') groupPrefix = `${groupPrefix}-SN`;

    // Semestry siatki godzin nalezace do tego roku studiow: [2*rok-1, 2*rok].
    // Agregujemy oba semestry (zima+lato), bo grupa jest per ROK, nie per semestr —
    // to samo grono studentow potrzebuje np. cwiczen z W semestru i L z semestru zima+lato.
    const curriculumSemesters = [studyYear * 2 - 1, studyYear * 2];

    const curriculumVersions = await prisma.curriculumVersion.findMany({
      where: {
        isActive: true,
        ...(specializationId ? { specializationId } : { specialization: { fieldOfStudyId } }),
        ...(studyMode ? { studyMode } : {}),
      },
      include: {
        entries: {
          where: { semester: { in: curriculumSemesters } },
          select: { hoursLecture: true, hoursExercise: true, hoursLab: true, hoursProject: true, hoursSeminar: true },
        },
      },
    });

    const classTypes = new Set<GroupType>();
    for (const version of curriculumVersions) {
      for (const entry of version.entries) {
        if (entry.hoursLecture > 0) classTypes.add('LECTURE');
        if (entry.hoursExercise > 0) classTypes.add('EXERCISE');
        if (entry.hoursLab > 0) classTypes.add('LAB');
        if (entry.hoursProject > 0) classTypes.add('PROJECT');
        if (entry.hoursSeminar > 0) classTypes.add('SEMINAR');
      }
    }

    if (classTypes.size === 0) {
      res.status(400).json({ error: 'Brak wpisow w siatce godzin dla tego roku studiow' });
      return;
    }
    if ((classTypes.has('EXERCISE') || classTypes.has('LAB')) && !exerciseGroupCount) {
      res.status(400).json({ error: 'Podaj liczbe grup cwiczeniowych (exerciseGroupCount)' });
      return;
    }
    if (classTypes.has('LAB') && !labPerExercise) {
      res.status(400).json({ error: 'Podaj liczbe podgrup laboratoryjnych na grupe cwiczeniowa (labPerExercise)' });
      return;
    }

    const proposal = generateForStudyYear(
      studyYear,
      groupPrefix,
      totalStudents,
      classTypes,
      exerciseGroupCount ?? 1,
      labPerExercise ?? 1,
    );

    res.json({ data: { proposal, meta: { totalStudents, academicYear, studyYear } } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// POST /api/groups/confirm — zatwierdz i zapisz propozycje
export async function confirm(req: Request, res: Response): Promise<void> {
  try {
    const { fieldOfStudyId, specializationId, academicYear, studyMode, proposal } = req.body as {
      fieldOfStudyId?: string;
      specializationId?: string;
      academicYear?: string;
      studyMode?: StudyMode;
      proposal?: Array<{ name: string; type: GroupType; size: number; parentName: string | null; studyYear: number }>;
    };

    if (!fieldOfStudyId || !academicYear || !proposal?.length) {
      res.status(400).json({ error: 'Brakujace wymagane pola' });
      return;
    }

    // Rodzice przed dziecmi.
    const sorted = [...proposal].sort((a, b) => {
      if (!a.parentName && b.parentName) return -1;
      if (a.parentName && !b.parentName) return 1;
      return 0;
    });

    const created = await prisma.$transaction(async (tx) => {
      const nameToId = new Map<string, string>();
      const results = [];
      for (const group of sorted) {
        const parentId = group.parentName ? nameToId.get(group.parentName) : undefined;
        const saved = await tx.studentGroup.create({
          data: {
            name: group.name,
            type: group.type,
            size: group.size,
            fieldOfStudyId,
            specializationId: specializationId ?? null,
            studyYear: group.studyYear,
            academicYear,
            studyMode: studyMode ?? 'FULL_TIME',
            parentGroupId: parentId ?? null,
          },
        });
        nameToId.set(group.name, saved.id);
        results.push(saved);
      }
      return results;
    });

    res.status(201).json({ data: created, message: `Zapisano ${created.length} grup` });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Grupa o tej nazwie juz istnieje w tym roku akademickim' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// Dozwolony typ grupy nadrzednej dla danego typu. null -> brak rodzica (najwyzszy poziom).
const allowedParentType: Record<GroupType, GroupType | null> = {
  LECTURE: null,
  EXERCISE: 'LECTURE',
  LAB: 'EXERCISE',
  PROJECT: 'LECTURE',
  SEMINAR: 'LECTURE',
};

// POST /api/groups — utworz grupe recznie
export async function createOne(req: Request, res: Response): Promise<void> {
  try {
    const { name, type, size, fieldOfStudyId, specializationId, studyYear, academicYear, studyMode, parentGroupId, preferredRoomId } =
      req.body as {
        name?: string;
        type?: GroupType;
        size?: number;
        fieldOfStudyId?: string;
        specializationId?: string;
        studyYear?: number;
        academicYear?: string;
        studyMode?: StudyMode;
        parentGroupId?: string;
        preferredRoomId?: string;
      };

    if (!name || !type || !size || !fieldOfStudyId || !studyYear || !academicYear) {
      res.status(400).json({ error: 'Brakujace wymagane pola' });
      return;
    }

    const expectedParentType = allowedParentType[type];
    if (expectedParentType === null && parentGroupId) {
      res.status(422).json({ error: `Grupa typu ${type} nie moze miec grupy nadrzednej` });
      return;
    }
    if (expectedParentType !== null && !parentGroupId) {
      res.status(422).json({ error: `Grupa typu ${type} wymaga grupy nadrzednej typu ${expectedParentType}` });
      return;
    }

    if (parentGroupId) {
      const parent = await prisma.studentGroup.findUnique({ where: { id: parentGroupId } });
      if (!parent) {
        res.status(404).json({ error: 'Grupa nadrzedna nie znaleziona' });
        return;
      }
      if (parent.type !== expectedParentType) {
        res.status(422).json({
          error: `Grupa typu ${type} musi miec grupe nadrzedna typu ${expectedParentType} (podano ${parent.type})`,
        });
        return;
      }
      if (parent.studyYear !== studyYear || parent.academicYear !== academicYear || parent.fieldOfStudyId !== fieldOfStudyId) {
        res.status(422).json({ error: 'Grupa nadrzedna musi nalezec do tego samego kierunku, roku studiow i roku akademickiego' });
        return;
      }
      if (studyMode && parent.studyMode !== studyMode) {
        res.status(422).json({ error: 'Grupa nadrzedna musi byc w tym samym trybie studiow' });
        return;
      }
    }

    const data = await prisma.studentGroup.create({
      data: {
        name,
        type,
        size,
        fieldOfStudyId,
        specializationId: specializationId ?? null,
        studyYear,
        academicYear,
        studyMode: studyMode ?? 'FULL_TIME',
        parentGroupId: parentGroupId ?? null,
        preferredRoomId: preferredRoomId ?? null,
      },
    });
    res.status(201).json({ data, message: 'Grupa utworzona' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Grupa o tej nazwie juz istnieje w tym roku akademickim' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// PUT /api/groups/:id
export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { name, size, preferredRoomId } = req.body as {
      name?: string;
      size?: number;
      preferredRoomId?: string | null;
    };
    const data = await prisma.studentGroup.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(size !== undefined ? { size } : {}),
        ...(preferredRoomId !== undefined ? { preferredRoomId } : {}),
      },
    });
    res.json({ data, message: 'Grupa zaktualizowana' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Grupa nie znaleziona' });
      return;
    }
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Grupa o tej nazwie juz istnieje w tym roku akademickim' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// DELETE /api/groups/:id
export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const group = await prisma.studentGroup.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { scheduleEntries: true, templateEntries: true, subGroups: true } } },
    });
    if (!group) {
      res.status(404).json({ error: 'Grupa nie znaleziona' });
      return;
    }
    if (group._count.scheduleEntries > 0 || group._count.templateEntries > 0) {
      res.status(409).json({ error: 'Nie mozna usunac grupy przypisanej do planu zajec' });
      return;
    }
    if (group._count.subGroups > 0) {
      res.status(409).json({ error: 'Nie mozna usunac grupy nadrzednej — usun najpierw jej podgrupy' });
      return;
    }
    await prisma.studentGroup.delete({ where: { id: req.params.id } });
    res.json({ message: 'Grupa usunieta' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Grupa nie znaleziona' });
      return;
    }
    if (isForeignKeyError(error)) {
      res.status(409).json({ error: 'Nie mozna usunac grupy — jest jeszcze uzywana' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// DELETE /api/groups — usun wszystkie grupy (opcjonalnie filtrowane po roku)
export async function removeAll(req: Request, res: Response): Promise<void> {
  try {
    const { academicYear } = req.query;
    const result = await prisma.studentGroup.deleteMany({
      where: {
        ...(academicYear ? { academicYear: String(academicYear) } : {}),
        scheduleEntries: { none: {} },
        templateEntries: { none: {} },
      },
    });
    res.json({ message: `Usunieto ${result.count} grup` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
