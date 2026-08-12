import type { Request, Response } from 'express';
import type { ClassType, DayOfWeek, StudyMode, WeekType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isNotFoundError } from '../lib/prismaErrors';
import { validateTemplate, isBadRequestError, type TemplateValidationDto } from '../services/scheduleValidation';
import { getCallerInstructorId } from '../lib/callerInstructor';
import { getCallerFacultyId } from '../lib/callerFaculty';
import { resolveFacultyId } from '../lib/curriculumFaculty';

const templateInclude = {
  // startSemesterType idzie do klienta, bo bez niego podglad kolizji na siatce nie
  // odrozni wzorca zimowego od letniego — patrz sameSemesterType w scheduleValidation.
  curriculumEntry: {
    include: {
      subject: { select: { id: true, name: true } },
      curriculumVersion: { select: { startSemesterType: true } },
    },
  },
  room: { select: { id: true, number: true, type: true, capacity: true, building: { select: { id: true, name: true } } } },
  instructor: { select: { id: true, firstName: true, lastName: true, title: true } },
  studentGroup: { select: { id: true, name: true, parentGroupId: true } },
  startBlock: { select: { id: true, order: true, startTime: true, label: true } },
  endBlock: { select: { id: true, order: true, endTime: true, label: true } },
};

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const { semester, academicYear, studyMode, studentGroupId, fieldOfStudyId, specializationId } = req.query;

    // Dziekanat widzi tylko wlasny wydzial — nadpisujemy ewentualny parametr z zapytania.
    const facultyId =
      req.user!.role === 'DEAN_OFFICE'
        ? await getCallerFacultyId(req.user!.id)
        : req.query.facultyId
          ? String(req.query.facultyId)
          : undefined;

    // Specjalnosc i kierunek nadal siegaja w glab siatki, ale wydzial ma juz wlasna
    // kolumne — filtrujemy po niej wprost, bez zagniezdzonego joina.
    const curriculumFilters = [];
    if (specializationId) {
      curriculumFilters.push({ curriculumEntry: { curriculumVersion: { specializationId: String(specializationId) } } });
    } else if (fieldOfStudyId) {
      curriculumFilters.push({ curriculumEntry: { curriculumVersion: { specialization: { fieldOfStudyId: String(fieldOfStudyId) } } } });
    }

    const data = await prisma.scheduleTemplate.findMany({
      where: {
        ...(semester ? { semester: Number(semester) } : {}),
        ...(academicYear ? { academicYear: String(academicYear) } : {}),
        ...(studyMode ? { studyMode: studyMode as StudyMode } : {}),
        ...(studentGroupId ? { studentGroupId: String(studentGroupId) } : {}),
        ...(facultyId ? { facultyId } : {}),
        ...(curriculumFilters.length > 0 ? { AND: curriculumFilters } : {}),
      },
      include: templateInclude,
      orderBy: [{ dayOfWeek: 'asc' }, { startBlock: { order: 'asc' } }],
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      curriculumEntryId?: string;
      classType?: ClassType;
      roomId?: string;
      instructorId?: string;
      studentGroupId?: string | null;
      dayOfWeek?: DayOfWeek;
      startBlockId?: string;
      endBlockId?: string;
      semester?: number;
      academicYear?: string;
      weekType?: WeekType;
      studyMode?: StudyMode;
    };

    if (!body.curriculumEntryId || !body.classType || !body.roomId || !body.instructorId ||
        !body.dayOfWeek || !body.startBlockId || !body.endBlockId || !body.semester || !body.academicYear) {
      res.status(400).json({ error: 'Brakujace wymagane pola' });
      return;
    }

    // INSTRUCTOR moze tworzyc wzorce tylko dla siebie.
    if (req.user!.role === 'INSTRUCTOR') {
      const myInstructorId = await getCallerInstructorId(req.user!.id);
      if (myInstructorId !== body.instructorId) {
        res.status(403).json({ error: 'Mozesz tworzyc wzorce tylko dla siebie' });
        return;
      }
    }

    // Wydzial bierzemy z siatki, nie z zadania — klient nie moze go podstawic.
    const facultyId = await resolveFacultyId(body.curriculumEntryId);
    if (!facultyId) {
      res.status(400).json({ error: 'Wpis siatki nie istnieje' });
      return;
    }
    // Dziekanat planuje wylacznie w obrebie swojego wydzialu.
    if (req.user!.role === 'DEAN_OFFICE') {
      const myFacultyId = await getCallerFacultyId(req.user!.id);
      if (myFacultyId !== facultyId) {
        res.status(403).json({ error: 'Mozesz planowac tylko w obrebie swojego wydzialu' });
        return;
      }
    }

    const dto: TemplateValidationDto = {
      classType: body.classType,
      roomId: body.roomId,
      instructorId: body.instructorId,
      studentGroupId: body.studentGroupId ?? null,
      dayOfWeek: body.dayOfWeek,
      startBlockId: body.startBlockId,
      endBlockId: body.endBlockId,
      academicYear: body.academicYear,
      semester: body.semester,
      curriculumEntryId: body.curriculumEntryId,
      weekType: body.weekType ?? 'EVERY',
      studyMode: body.studyMode ?? 'FULL_TIME',
    };
    const error = await validateTemplate(dto);
    if (error) {
      res.status(isBadRequestError(error) ? 400 : 409).json({ error: error.code, details: error.details });
      return;
    }

    const data = await prisma.scheduleTemplate.create({
      data: {
        curriculumEntryId: body.curriculumEntryId,
        facultyId,
        classType: body.classType,
        roomId: body.roomId,
        instructorId: body.instructorId,
        studentGroupId: body.studentGroupId ?? null,
        dayOfWeek: body.dayOfWeek,
        startBlockId: body.startBlockId,
        endBlockId: body.endBlockId,
        semester: body.semester,
        academicYear: body.academicYear,
        weekType: body.weekType ?? 'EVERY',
        studyMode: body.studyMode ?? 'FULL_TIME',
      },
      include: templateInclude,
    });
    res.status(201).json({ data, message: 'Wzorzec dodany' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.scheduleTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Wzorzec nie znaleziony' });
      return;
    }

    const body = req.body as Partial<{
      classType: ClassType;
      roomId: string;
      instructorId: string;
      studentGroupId: string | null;
      dayOfWeek: DayOfWeek;
      startBlockId: string;
      endBlockId: string;
      weekType: WeekType;
      studyMode: StudyMode;
    }>;

    if (req.user!.role === 'INSTRUCTOR') {
      const myInstructorId = await getCallerInstructorId(req.user!.id);
      if (myInstructorId !== existing.instructorId) {
        res.status(403).json({ error: 'Mozesz edytowac tylko wlasne wzorce' });
        return;
      }
      if (body.instructorId && body.instructorId !== existing.instructorId) {
        res.status(403).json({ error: 'Zmiana prowadzacego nalezy do dziekanatu lub admina' });
        return;
      }
    }
    if (req.user!.role === 'DEAN_OFFICE') {
      const myFacultyId = await getCallerFacultyId(req.user!.id);
      if (myFacultyId !== existing.facultyId) {
        res.status(403).json({ error: 'Mozesz edytowac tylko wzorce swojego wydzialu' });
        return;
      }
    }

    // Uwaga: body nie zawiera curriculumEntryId, wiec wydzial wzorca jest niezmienny —
    // facultyId nie moze sie rozjechac z siatka.

    const dto: TemplateValidationDto = {
      classType: body.classType ?? existing.classType,
      roomId: body.roomId ?? existing.roomId,
      instructorId: body.instructorId ?? existing.instructorId,
      studentGroupId: body.studentGroupId !== undefined ? body.studentGroupId : existing.studentGroupId,
      dayOfWeek: body.dayOfWeek ?? existing.dayOfWeek,
      startBlockId: body.startBlockId ?? existing.startBlockId,
      endBlockId: body.endBlockId ?? existing.endBlockId,
      academicYear: existing.academicYear,
      // Semestr i siatka sa niezmienne przy edycji (body ich nie zawiera).
      semester: existing.semester,
      curriculumEntryId: existing.curriculumEntryId,
      weekType: body.weekType ?? existing.weekType,
      studyMode: body.studyMode ?? existing.studyMode,
      excludeId: existing.id,
    };
    const error = await validateTemplate(dto);
    if (error) {
      res.status(isBadRequestError(error) ? 400 : 409).json({ error: error.code, details: error.details });
      return;
    }

    const data = await prisma.scheduleTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(body.classType ? { classType: body.classType } : {}),
        ...(body.roomId ? { roomId: body.roomId } : {}),
        ...(body.instructorId ? { instructorId: body.instructorId } : {}),
        ...(body.studentGroupId !== undefined ? { studentGroupId: body.studentGroupId } : {}),
        ...(body.dayOfWeek ? { dayOfWeek: body.dayOfWeek } : {}),
        ...(body.startBlockId ? { startBlockId: body.startBlockId } : {}),
        ...(body.endBlockId ? { endBlockId: body.endBlockId } : {}),
        ...(body.weekType ? { weekType: body.weekType } : {}),
        ...(body.studyMode ? { studyMode: body.studyMode } : {}),
      },
      include: templateInclude,
    });
    res.json({ data, message: 'Wzorzec zaktualizowany' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Wzorzec nie znaleziony' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.scheduleTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Wzorzec nie znaleziony' });
      return;
    }
    if (req.user!.role === 'INSTRUCTOR') {
      const myInstructorId = await getCallerInstructorId(req.user!.id);
      if (myInstructorId !== existing.instructorId) {
        res.status(403).json({ error: 'Mozesz usuwac tylko wlasne wzorce' });
        return;
      }
    }
    if (req.user!.role === 'DEAN_OFFICE') {
      const myFacultyId = await getCallerFacultyId(req.user!.id);
      if (myFacultyId !== existing.facultyId) {
        res.status(403).json({ error: 'Mozesz usuwac tylko wzorce swojego wydzialu' });
        return;
      }
    }
    // Kalendarz zostaje nietkniety — wygenerowane terminy traca tylko powiazanie
    // z seria (templateId -> NULL) i znikna przy najblizszym generowaniu semestru.
    await prisma.scheduleTemplate.delete({ where: { id: req.params.id } });
    res.json({ message: 'Wzorzec usuniety' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Wzorzec nie znaleziony' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

/**
 * Kasowanie calego wzorca tygodnia naraz.
 *
 * Zakres wskazujemy wprost lista id, a nie filtrami — widok sklada wzorce z kilku
 * warunkow (rok, tryb, pora semestru liczona z naboru siatki), wiec filtr powtorzony
 * po stronie serwera latwo rozjechalby sie z tym, co planista widzi na ekranie.
 * Kalendarz zostaje nietkniety — jak przy usuwaniu pojedynczego wzorca.
 */
export async function removeMany(req: Request, res: Response): Promise<void> {
  try {
    const { ids } = req.body as { ids?: string[] };
    if (!ids?.length) {
      res.status(400).json({ error: 'Brakujace pole: ids' });
      return;
    }

    const existing = await prisma.scheduleTemplate.findMany({
      where: { id: { in: ids } },
      select: { id: true, facultyId: true },
    });

    // Dziekanat czysci wylacznie swoj wydzial — jeden obcy wzorzec na liscie
    // przerywa calosc, zeby nie kasowac "polowy" tego, o co poproszono.
    if (req.user!.role === 'DEAN_OFFICE') {
      const myFacultyId = await getCallerFacultyId(req.user!.id);
      if (existing.some((template) => template.facultyId !== myFacultyId)) {
        res.status(403).json({ error: 'Mozesz usuwac tylko wzorce swojego wydzialu' });
        return;
      }
    }

    const { count } = await prisma.scheduleTemplate.deleteMany({
      where: { id: { in: existing.map((template) => template.id) } },
    });
    res.json({ data: { deleted: count }, message: `Usunieto wzorce tygodnia: ${count}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// ─── Bilans pokrycia: wymagane vs zaplanowane godziny per przedmiot/typ/grupa ───

export async function getSummary(req: Request, res: Response): Promise<void> {
  try {
    const { curriculumVersionId } = req.params;
    const entries = await prisma.curriculumEntry.findMany({
      where: { curriculumVersionId },
      include: {
        subject: { select: { name: true } },
        scheduleEntries: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            classType: true,
            studentGroupId: true,
            studentGroup: { select: { name: true } },
            startBlock: { select: { order: true } },
            endBlock: { select: { order: true } },
          },
        },
        templateEntries: {
          select: { classType: true, studentGroupId: true, studentGroup: { select: { name: true } } },
        },
      },
      orderBy: [{ semester: 'asc' }, { orderInSemester: 'asc' }],
    });

    if (entries.length === 0) {
      res.status(404).json({ error: 'Siatka nie istnieje lub jest pusta' });
      return;
    }

    const NO_GROUP = '__none__';
    const CLASS_TYPES: { type: ClassType; hoursKey: 'hoursLecture' | 'hoursExercise' | 'hoursLab' | 'hoursProject' | 'hoursSeminar' }[] = [
      { type: 'LECTURE', hoursKey: 'hoursLecture' },
      { type: 'EXERCISE', hoursKey: 'hoursExercise' },
      { type: 'LAB', hoursKey: 'hoursLab' },
      { type: 'PROJECT', hoursKey: 'hoursProject' },
      { type: 'SEMINAR', hoursKey: 'hoursSeminar' },
    ];

    const semesterMap = new Map<number, unknown[]>();

    for (const entry of entries) {
      if (!semesterMap.has(entry.semester)) semesterMap.set(entry.semester, []);

      for (const { type, hoursKey } of CLASS_TYPES) {
        const required = entry[hoursKey];
        if (required <= 0) continue;

        // Grupy oczekiwane: z wzorcow (wykrywa grupe z wzorcem, ale zero terminow) + z terminow.
        const groupNames = new Map<string, string>();
        for (const t of entry.templateEntries) {
          if (t.classType !== type) continue;
          groupNames.set(t.studentGroupId ?? NO_GROUP, t.studentGroup?.name ?? 'bez grupy');
        }
        for (const se of entry.scheduleEntries) {
          if (se.classType !== type) continue;
          const key = se.studentGroupId ?? NO_GROUP;
          if (!groupNames.has(key)) groupNames.set(key, se.studentGroup?.name ?? 'bez grupy');
        }

        const groups = [...groupNames.entries()]
          .map(([key, groupName]) => {
            const planned = entry.scheduleEntries
              .filter((se) => se.classType === type && (se.studentGroupId ?? NO_GROUP) === key)
              .reduce((sum, se) => sum + (se.endBlock.order - se.startBlock.order + 1), 0);
            return { groupName, planned, required, completed: planned >= required };
          })
          .sort((a, b) => a.groupName.localeCompare(b.groupName));

        const groupCount = Math.max(groups.length, 1);
        const totalRequired = required * groupCount;
        const totalPlanned = groups.reduce((sum, g) => sum + g.planned, 0);

        semesterMap.get(entry.semester)!.push({
          subjectName: entry.subject.name,
          classType: type,
          planned: totalPlanned,
          required: totalRequired,
          remaining: totalRequired - totalPlanned,
          completed: groups.length > 0 && groups.every((g) => g.completed),
          groups,
        });
      }
    }

    const semesters = [...semesterMap.entries()].map(([semester, subjects]) => ({ semester, subjects }));
    res.json({ data: { semesters } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
