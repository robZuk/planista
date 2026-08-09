import type { Request, Response } from 'express';
import type { GroupType, StudyMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isNotFoundError, isUniqueConstraintError, isForeignKeyError } from '../lib/prismaErrors';

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

/** "2024/2025" -> "2025/2026". Zwraca null dla formatu spoza wzorca RRRR/RRRR. */
function nextAcademicYear(year: string): string | null {
  const match = /^(\d{4})\/(\d{4})$/.exec(year);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end !== start + 1) return null;
  return `${start + 1}/${end + 1}`;
}

// POST /api/groups/copy-to-next-year — skopiuj wszystkie grupy roku na kolejny rok akademicki
export async function copyToNextYear(req: Request, res: Response): Promise<void> {
  try {
    const { academicYear } = req.body as { academicYear?: string };
    if (!academicYear) {
      res.status(400).json({ error: 'Brak roku akademickiego' });
      return;
    }

    const targetYear = nextAcademicYear(academicYear);
    if (!targetYear) {
      res.status(422).json({ error: 'Nieprawidlowy format roku akademickiego (oczekiwano RRRR/RRRR)' });
      return;
    }

    // Nie nadpisujemy — kopiowac mozna tylko do pustego rocznika.
    const existing = await prisma.studentGroup.count({ where: { academicYear: targetYear } });
    if (existing > 0) {
      res.status(409).json({ error: `Rok ${targetYear} ma juz ${existing} grup — usun je najpierw` });
      return;
    }

    const source = await prisma.studentGroup.findMany({
      where: { academicYear },
      select: {
        id: true, name: true, type: true, size: true, studyYear: true, studyMode: true,
        fieldOfStudyId: true, specializationId: true, parentGroupId: true, preferredRoomId: true,
      },
    });
    if (source.length === 0) {
      res.status(404).json({ error: `Rok ${academicYear} nie ma zadnych grup do skopiowania` });
      return;
    }

    // Rodzice przed dziecmi — tworzymy przejsciami, przemapowujac stare id rodzica na nowe.
    const created = await prisma.$transaction(async (tx) => {
      const idMap = new Map<string, string>();
      let remaining = source;
      let count = 0;

      while (remaining.length > 0) {
        const ready = remaining.filter((g) => !g.parentGroupId || idMap.has(g.parentGroupId));
        if (ready.length === 0) {
          throw new Error('Niespojna hierarchia grup — osierocony parentGroupId');
        }
        for (const g of ready) {
          const saved = await tx.studentGroup.create({
            data: {
              name: g.name,
              type: g.type,
              size: g.size,
              studyYear: g.studyYear,
              studyMode: g.studyMode,
              academicYear: targetYear,
              fieldOfStudyId: g.fieldOfStudyId,
              specializationId: g.specializationId,
              parentGroupId: g.parentGroupId ? idMap.get(g.parentGroupId)! : null,
              preferredRoomId: g.preferredRoomId,
            },
          });
          idMap.set(g.id, saved.id);
          count++;
        }
        remaining = remaining.filter((g) => !idMap.has(g.id));
      }
      return count;
    });

    res.status(201).json({ data: { targetYear, count: created }, message: `Skopiowano ${created} grup do roku ${targetYear}` });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Konflikt nazw grup w roku docelowym' });
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
