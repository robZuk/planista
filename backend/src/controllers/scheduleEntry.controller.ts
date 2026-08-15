import type { ClassType, EntryStatus, SemesterType, StudyMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateEntry, isBadRequestError, checkRoomType } from '../services/scheduleValidation';
import { getGroupFamilyIds } from '../lib/groupFamily';
import { getCallerInstructorId } from '../lib/callerInstructor';
import { getCallerFacultyId } from '../lib/callerFaculty';
import { resolveFacultyId } from '../lib/curriculumFaculty';
import { resolveSemesterRange } from '../lib/semesterCalendar';
import { semesterTypeOf } from '../lib/semester';
import { rangesOverlap, checkTimeWindow, dateToStr } from '../lib/scheduleTime';

/**
 * Granice semestru (klucze RRRR-MM-DD) dla terminu — z kalendarza wydzialu, a gdy go
 * nie ma, z dat wyliczonych z roku. Sluzy do pilnowania, ze reczne przeniesienie/dodanie
 * nie wyrzuci zajec poza semestr (generator i tak rozpisuje plan tylko w tym zakresie).
 * null = nie da sie wyznaczyc (brak wpisu siatki) — wtedy nie blokujemy.
 */
async function semesterKeysForEntry(
  curriculumEntryId: string,
  facultyId: string,
): Promise<{ startKey: string; endKey: string } | null> {
  const ce = await prisma.curriculumEntry.findUnique({
    where: { id: curriculumEntryId },
    select: {
      semester: true,
      curriculumVersion: { select: { academicYear: true, studyMode: true, startSemesterType: true } },
    },
  });
  if (!ce) return null;
  const semesterType = semesterTypeOf(ce.curriculumVersion.startSemesterType, ce.semester);
  const range = await resolveSemesterRange(
    ce.curriculumVersion.academicYear,
    semesterType,
    ce.curriculumVersion.studyMode,
    facultyId,
  );
  return { startKey: dateToStr(range.startDate), endKey: dateToStr(range.endDate) };
}

const entryInclude = {
  room: { select: { id: true, number: true, type: true, building: { select: { id: true, name: true } } } },
  instructor: { select: { id: true, firstName: true, lastName: true, title: true } },
  studentGroup: { select: { id: true, name: true } },
  // semester + specjalnosc (przez wersje siatki) — do filtrow w widoku kalendarza.
  // studyMode bierzemy z siatki, a nie z wzorca: termin dodany recznie ma template = null,
  // a filtr trybu w kalendarzu musi dzialac tak samo dla obu rodzajow terminow.
  curriculumEntry: {
    select: {
      id: true,
      semester: true,
      subject: { select: { id: true, name: true } },
      curriculumVersion: { select: { specializationId: true, studyMode: true } },
    },
  },
  template: { select: { id: true, dayOfWeek: true, weekType: true, studyMode: true } },
  startBlock: { select: { id: true, order: true, startTime: true, label: true } },
  endBlock: { select: { id: true, order: true, endTime: true, label: true } },
};

export const getAll = asyncHandler(async (req, res) => {
  const { from, to, studentGroupId, instructorId, status } = req.query;
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = new Date(String(from) + 'T00:00:00.000Z');
  if (to) dateFilter.lte = new Date(String(to) + 'T23:59:59.999Z');

  // Dziekanat widzi tylko wlasny wydzial — nadpisujemy ewentualny parametr z zapytania.
  const facultyId =
    req.user!.role === 'DEAN_OFFICE'
      ? await getCallerFacultyId(req.user!.id)
      : req.query.facultyId
        ? String(req.query.facultyId)
        : undefined;

  const data = await prisma.scheduleEntry.findMany({
    where: {
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
      ...(studentGroupId ? { studentGroupId: String(studentGroupId) } : {}),
      ...(instructorId ? { instructorId: String(instructorId) } : {}),
      ...(status ? { status: status as EntryStatus } : {}),
      ...(facultyId ? { facultyId } : {}),
    },
    include: entryInclude,
    // W jednym bloku czasowym siedzi zwykle kilka terminow naraz (rozne grupy i sale),
    // wiec data + blok to za malo. Grupa i sala ustawiaja je w kolejnosci czytelnej
    // w siatce, a id domyka porzadek — terminy bez grupy tez maja stale miejsce.
    orderBy: [
      { date: 'asc' },
      { startBlock: { order: 'asc' } },
      { studentGroup: { name: 'asc' } },
      { room: { number: 'asc' } },
      { id: 'asc' },
    ],
  });
  res.json({ data });
});

/**
 * Recznie dodany pojedynczy termin — bez wzorca (templateId=null). Sluzy np. do
 * dodania odrobienia zajec (status MAKEUP) w wolnym terminie kalendarza.
 */
export const create = asyncHandler(async (req, res) => {
  const body = req.body as {
    date?: string;
    classType?: ClassType;
    roomId?: string;
    instructorId?: string;
    studentGroupId?: string | null;
    curriculumEntryId?: string;
    startBlockId?: string;
    endBlockId?: string;
    status?: EntryStatus;
  };

  if (!body.date || !body.classType || !body.roomId || !body.instructorId ||
      !body.curriculumEntryId || !body.startBlockId || !body.endBlockId) {
    throw new AppError(400, 'Brakujace wymagane pola');
  }

  if (req.user!.role === 'INSTRUCTOR') {
    const myInstructorId = await getCallerInstructorId(req.user!.id);
    if (myInstructorId !== body.instructorId) {
      throw new AppError(403, 'Mozesz dodawac terminy tylko dla siebie');
    }
  }

  // Wydzial bierzemy z siatki takze dla terminu recznego — to po nim generator
  // rozpozna, ze ma go skasowac przy nadpisywaniu kalendarza wydzialu.
  const facultyId = await resolveFacultyId(body.curriculumEntryId);
  if (!facultyId) throw new AppError(400, 'Wpis siatki nie istnieje');
  if (req.user!.role === 'DEAN_OFFICE') {
    const myFacultyId = await getCallerFacultyId(req.user!.id);
    if (myFacultyId !== facultyId) {
      throw new AppError(403, 'Mozesz dodawac terminy tylko w obrebie swojego wydzialu');
    }
  }

  // Termin musi miescic sie w zakresie semestru wydzialu — inaczej wisialby poza planem.
  const keys = await semesterKeysForEntry(body.curriculumEntryId, facultyId);
  if (keys) {
    const dayKey = dateToStr(new Date(body.date));
    if (dayKey < keys.startKey || dayKey > keys.endKey) {
      // Specjalny ksztalt ({ error: kod, details }) — obslugiwany przez frontend.
      res.status(400).json({ error: 'DATE_OUTSIDE_SEMESTER', details: { startDate: keys.startKey, endDate: keys.endKey } });
      return;
    }
  }

  const error = await validateEntry({
    date: new Date(body.date),
    roomId: body.roomId,
    instructorId: body.instructorId,
    studentGroupId: body.studentGroupId ?? null,
    startBlockId: body.startBlockId,
    endBlockId: body.endBlockId,
    classType: body.classType,
    curriculumEntryId: body.curriculumEntryId,
  });
  if (error) {
    res.status(isBadRequestError(error) ? 400 : 409).json({ error: error.code, details: error.details });
    return;
  }

  const data = await prisma.scheduleEntry.create({
    data: {
      date: new Date(body.date),
      classType: body.classType,
      roomId: body.roomId,
      instructorId: body.instructorId,
      studentGroupId: body.studentGroupId ?? null,
      curriculumEntryId: body.curriculumEntryId,
      facultyId,
      startBlockId: body.startBlockId,
      endBlockId: body.endBlockId,
      templateId: null,
      status: body.status ?? 'MAKEUP',
    },
    include: entryInclude,
  });
  res.status(201).json({ data, message: 'Termin dodany' });
});

/** Odwolanie / zmiana statusu / usuniecie pojedynczego terminu. */
export const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body as { status?: EntryStatus };
  if (!status) throw new AppError(400, 'Brakujace pole: status');
  const existing = await prisma.scheduleEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Termin nie znaleziony');
  if (req.user!.role === 'INSTRUCTOR') {
    const my = await getCallerInstructorId(req.user!.id);
    if (my !== existing.instructorId) throw new AppError(403, 'Mozesz edytowac tylko wlasne terminy');
  }
  // Zmiana statusu to decyzja per-termin — odczepiamy go od operacji na calej serii.
  const data = await prisma.scheduleEntry.update({
    where: { id: req.params.id },
    data: { status, detached: true },
    include: entryInclude,
  });
  res.json({ data, message: 'Status terminu zaktualizowany' });
});

export const remove = asyncHandler(async (req, res) => {
  const { scope } = (req.body ?? {}) as { scope?: 'ONE' | 'ALL' };
  const existing = await prisma.scheduleEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Termin nie znaleziony');
  if (req.user!.role === 'INSTRUCTOR') {
    const my = await getCallerInstructorId(req.user!.id);
    if (my !== existing.instructorId) throw new AppError(403, 'Mozesz usuwac tylko wlasne terminy');
  }

  // scope ALL — kasujemy ten termin i wszystkie KOLEJNE z tej samej serii (wzorca),
  // pomijajac terminy odczepione (detached). Semantyka lustrzana do przenoszenia serii
  // w move(): seria = wspolny templateId, od daty tego terminu w gore. Sam klikniety
  // termin usuwamy zawsze (galaz `id`), nawet jesli jest odczepiony.
  if (scope === 'ALL') {
    if (!existing.templateId) {
      throw new AppError(400, 'Brak serii — ten termin nie pochodzi z wzorca');
    }
    const fromDate = new Date(existing.date);
    fromDate.setUTCHours(0, 0, 0, 0);
    const seriesWhere = {
      OR: [
        { id: existing.id },
        { templateId: existing.templateId, date: { gte: fromDate }, detached: false },
      ],
    };
    // Instruktor kasuje tylko wlasne terminy — takze w obrebie serii.
    const where =
      req.user!.role === 'INSTRUCTOR'
        ? { AND: [seriesWhere, { instructorId: existing.instructorId }] }
        : seriesWhere;
    const { count } = await prisma.scheduleEntry.deleteMany({ where });
    res.json({ message: `Usunieto ${count} terminow z serii` });
    return;
  }

  await prisma.scheduleEntry.delete({ where: { id: req.params.id } });
  res.json({ message: 'Termin usuniety' });
});

/**
 * Wyczyszczenie kalendarza semestru dla jednego wydzialu.
 *
 * Zakres dat bierzemy z tego samego zrodla co generator (kalendarz wydzialu →
 * daty wyliczone z roku), a kasujemy terminy wydzialu z tego okna
 * — takze reczne i odwolane. Tak samo jak nadpisanie przez generator, tyle ze bez
 * tworzenia czegokolwiek w zamian. Wzorce tygodnia zostaja nietkniete.
 *
 * Zawezenie do trybu studiow tez jest wspolne z generatorem: plan drugiego trybu
 * stoi na tych samych datach i nie ma go po co ruszac.
 *
 * Operacja jest destrukcyjna, wiec dotyczy dokladnie jednego wydzialu — nie ma
 * wariantu "wszystkie wydzialy naraz".
 */
export const removeMany = asyncHandler(async (req, res) => {
  const { academicYear, semesterType, studyMode, facultyId: bodyFacultyId, scope } = req.body as {
    academicYear?: string;
    semesterType?: SemesterType;
    studyMode?: StudyMode;
    facultyId?: string;
    scope?: { fieldOfStudyId?: string; specializationId?: string; semester?: number };
  };

  if (!academicYear || !semesterType || !studyMode) {
    throw new AppError(400, 'Brakujace pola: academicYear, semesterType, studyMode');
  }

  const facultyId =
    req.user!.role === 'DEAN_OFFICE' ? await getCallerFacultyId(req.user!.id) : bodyFacultyId;
  if (!facultyId) {
    // Specjalny ksztalt ({ error, details }) — obslugiwany przez frontend.
    res.status(400).json({
      error: 'FACULTY_REQUIRED',
      details: { message: 'Czyszczenie kalendarza wymaga wskazania jednego wydzialu' },
    });
    return;
  }

  const range = await resolveSemesterRange(academicYear, semesterType, studyMode, facultyId);
  // Granice kalendarza stoja o polnocy, a terminy w poludnie UTC — rozciagamy do
  // pelnych dob, zeby nie ominac zajec z pierwszego i ostatniego dnia semestru
  // (identycznie jak generator).
  const rangeStart = new Date(range.startDate);
  rangeStart.setUTCHours(0, 0, 0, 0);
  const rangeEnd = new Date(range.endDate);
  rangeEnd.setUTCHours(23, 59, 59, 999);
  const dateRange = { gte: rangeStart, lte: rangeEnd };
  // Tryb studiow wyprowadzamy z siatki (termin go nie przechowuje) — inaczej czyszczenie
  // planu niestacjonarnego zabieralo tez stacjonarny z tych samych dat. Jak w generatorze,
  // wraz z opcjonalnym zawezeniem na kierunek / specjalnosc / semestr. Jeden warunek na
  // `curriculumEntry`, bo powtorzony klucz relacji nadpisalby poprzedni.
  const semesterScope = Number.isInteger(scope?.semester) ? scope!.semester : undefined;
  const where = {
    facultyId,
    date: dateRange,
    curriculumEntry: {
      ...(semesterScope ? { semester: semesterScope } : {}),
      curriculumVersion: {
        is: {
          studyMode,
          ...(scope?.specializationId ? { specializationId: scope.specializationId } : {}),
          ...(scope?.fieldOfStudyId && !scope.specializationId
            ? { specialization: { is: { fieldOfStudyId: scope.fieldOfStudyId } } }
            : {}),
        },
      },
    },
  };

  const doomed = await prisma.scheduleEntry.findMany({
    where,
    select: { templateId: true },
  });
  const manual = doomed.filter((entry) => entry.templateId === null).length;

  const { count } = await prisma.scheduleEntry.deleteMany({ where });

  res.json({
    data: {
      deleted: { total: count, manual },
      range: {
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
        source: range.source,
      },
    },
    message:
      `Wyczyszczono kalendarz wydzialu: usunieto ${count} terminow` +
      `${manual > 0 ? ` (w tym ${manual} recznych)` : ''}`,
  });
});

/**
 * Przeniesienie terminu (drag&drop).
 *  scope 'ONE' — tylko ten termin (nowa data + zakres blokow + opc. sala/prowadzacy).
 *  scope 'ALL' — wszystkie przyszle terminy tej serii, przesuniete na nowy dzien
 *                tygodnia + bloki (pomija dni wolne i terminy odczepione).
 *
 * Obie operacje sa CZYSTO KALENDARZOWE — wzorzec tygodnia zostaje nietkniety.
 * Przy najblizszym generowaniu semestru kalendarz i tak powstanie od nowa z wzorcow.
 */
export const move = asyncHandler(async (req, res) => {
  const { newDate, newStartBlockId, newEndBlockId, newRoomId, newInstructorId, scope } = req.body as {
    newDate?: string;
    newStartBlockId?: string;
    newEndBlockId?: string;
    newRoomId?: string;
    newInstructorId?: string;
    scope?: 'ONE' | 'ALL';
  };

  if (!newDate || !newStartBlockId || !newEndBlockId || !scope) {
    throw new AppError(400, 'Brakujace pola: newDate, newStartBlockId, newEndBlockId, scope');
  }

  const existing = await prisma.scheduleEntry.findUnique({ where: { id: req.params.id }, include: { template: true } });
  if (!existing) throw new AppError(404, 'Termin nie znaleziony');
  if (req.user!.role === 'INSTRUCTOR') {
    const my = await getCallerInstructorId(req.user!.id);
    if (my !== existing.instructorId) throw new AppError(403, 'Mozesz przenosic tylko wlasne terminy');
  }

  const targetRoomId = newRoomId ?? existing.roomId;
  const targetInstructorId = newInstructorId ?? existing.instructorId;
  const studyMode = existing.template?.studyMode;

  // ─── scope ONE ──────────────────────────────────────────
  if (scope === 'ONE') {
    // Nie pozwalamy wypchnac terminu poza zakres semestru wydzialu.
    const keys = await semesterKeysForEntry(existing.curriculumEntryId, existing.facultyId);
    if (keys) {
      const dayKey = dateToStr(new Date(newDate));
      if (dayKey < keys.startKey || dayKey > keys.endKey) {
        res.status(400).json({ error: 'DATE_OUTSIDE_SEMESTER', details: { startDate: keys.startKey, endDate: keys.endKey } });
        return;
      }
    }
    const error = await validateEntry({
      date: new Date(newDate),
      roomId: targetRoomId,
      instructorId: targetInstructorId,
      studentGroupId: existing.studentGroupId,
      startBlockId: newStartBlockId,
      endBlockId: newEndBlockId,
      classType: existing.classType,
      studyMode: studyMode ?? undefined,
      excludeId: existing.id,
    });
    if (error) {
      res.status(isBadRequestError(error) ? 400 : 409).json({ error: error.code, details: error.details });
      return;
    }
    const data = await prisma.scheduleEntry.update({
      where: { id: req.params.id },
      data: {
        date: new Date(newDate),
        startBlockId: newStartBlockId,
        endBlockId: newEndBlockId,
        roomId: targetRoomId,
        instructorId: targetInstructorId,
        // Reczne przeniesienie pojedynczego terminu odczepia go od serii — kolejne
        // przesuniecie calej serii (scope ALL) juz go pominie.
        detached: true,
      },
      include: entryInclude,
    });
    res.json({ data, message: 'Przeniesiono jeden termin' });
    return;
  }

  // ─── scope ALL ──────────────────────────────────────────
  // Seria = terminy dzielace wzorzec. Termin reczny (albo osierocony po usunieciu
  // wzorca) nie nalezy do zadnej serii, wiec nie ma czego przesuwac.
  if (!existing.templateId) {
    throw new AppError(400, 'Brak serii — ten termin nie pochodzi z wzorca');
  }

  const targetDate = new Date(newDate);
  const targetDayNum = targetDate.getUTCDay();

  // Sprawdz typ sali i okno trybu dla nowego umiejscowienia.
  const startBlock = await prisma.timeBlock.findUnique({ where: { id: newStartBlockId } });
  const room = await prisma.room.findUnique({ where: { id: targetRoomId }, select: { type: true } });
  if (room) {
    const typeErr = checkRoomType(existing.classType, room.type);
    if (typeErr) {
      res.status(400).json({ error: typeErr.code, details: typeErr.details });
      return;
    }
  }
  if (studyMode && startBlock) {
    const windowErr = checkTimeWindow(targetDayNum, startBlock.startTime, studyMode);
    if (windowErr) {
      res.status(400).json({ error: 'TIME_WINDOW_VIOLATION', details: { message: windowErr } });
      return;
    }
  }

  const fromDate = new Date(existing.date);
  fromDate.setUTCHours(0, 0, 0, 0);
  // detached: false — recznie poprzestawiane terminy zostaja nietkniete przy przenoszeniu serii.
  const futureEntries = await prisma.scheduleEntry.findMany({
    where: { templateId: existing.templateId, date: { gte: fromDate }, status: { not: 'CANCELLED' }, detached: false },
    orderBy: { date: 'asc' },
  });
  const futureIds = futureEntries.map((e) => e.id);

  // Nowe daty (ten sam tydzien, przesuniete na docelowy dzien tygodnia); pomijamy dni wolne.
  const shifted = futureEntries.map((e) => {
    const d = new Date(e.date);
    d.setUTCDate(d.getUTCDate() + (targetDayNum - d.getUTCDay()));
    d.setUTCHours(12, 0, 0, 0);
    return { entry: e, target: d };
  });
  const holidayList = await prisma.publicHoliday.findMany();
  const holidaySet = new Set(holidayList.map((h) => dateToStr(h.date)));
  const movable = shifted.filter((s) => !holidaySet.has(dateToStr(s.target)));

  // Zaden z przesunietych terminow nie moze wypasc poza zakres semestru wydzialu.
  const rangeKeys = await semesterKeysForEntry(existing.curriculumEntryId, existing.facultyId);
  if (rangeKeys) {
    const outside = movable.find((s) => {
      const k = dateToStr(s.target);
      return k < rangeKeys.startKey || k > rangeKeys.endKey;
    });
    if (outside) {
      res.status(400).json({
        error: 'DATE_OUTSIDE_SEMESTER',
        details: { startDate: rangeKeys.startKey, endDate: rangeKeys.endKey, when: dateToStr(outside.target) },
      });
      return;
    }
  }

  // Zakres blokow docelowy (order) do sprawdzenia konfliktow.
  const [ns, ne] = await Promise.all([
    prisma.timeBlock.findUnique({ where: { id: newStartBlockId }, select: { order: true } }),
    prisma.timeBlock.findUnique({ where: { id: newEndBlockId }, select: { order: true } }),
  ]);
  if (!ns || !ne || ne.order < ns.order) {
    res.status(400).json({ error: 'BAD_BLOCK_RANGE', details: { message: 'Nieprawidlowy zakres blokow' } });
    return;
  }
  const groupFamilyIds = existing.studentGroupId ? await getGroupFamilyIds(existing.studentGroupId) : [];

  // Konflikty: dla kazdej docelowej daty sprawdz wpisy SPOZA przenoszonego zbioru.
  for (const { target } of movable) {
    const dayStart = new Date(target);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(target);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const base = { date: { gte: dayStart, lte: dayEnd }, status: { not: 'CANCELLED' as const }, id: { notIn: futureIds } };
    // Pelne szczegoly konfliktu (label + zakres blokow), zeby komunikat byl czytelny —
    // tak samo jak validateEntry przy przenoszeniu pojedynczego terminu. Bez tego
    // front pokazywal "... undefined (undefined)".
    const blockTimes = {
      startBlock: { select: { order: true, startTime: true } },
      endBlock: { select: { order: true, endTime: true } },
    };
    const hit = <T extends { startBlock: { order: number }; endBlock: { order: number } }>(list: T[]) =>
      list.find((x) => rangesOverlap(ns.order, ne.order, x.startBlock.order, x.endBlock.order));

    const roomC = await prisma.scheduleEntry.findMany({
      where: { ...base, roomId: targetRoomId },
      include: { ...blockTimes, room: { select: { number: true, building: { select: { name: true } } } } },
    });
    const roomHit = hit(roomC);
    if (roomHit) {
      res.status(409).json({
        error: 'ROOM_CONFLICT',
        details: {
          conflictId: roomHit.id,
          label: `${roomHit.room.building.name}, sala ${roomHit.room.number}`,
          blockRange: `${roomHit.startBlock.startTime}-${roomHit.endBlock.endTime}`,
          when: dateToStr(target),
        },
      });
      return;
    }
    const instrC = await prisma.scheduleEntry.findMany({
      where: { ...base, instructorId: targetInstructorId },
      include: { ...blockTimes, instructor: { select: { firstName: true, lastName: true, title: true } } },
    });
    const instrHit = hit(instrC);
    if (instrHit) {
      const i = instrHit.instructor;
      res.status(409).json({
        error: 'INSTRUCTOR_CONFLICT',
        details: {
          conflictId: instrHit.id,
          label: `${i.title ? i.title + ' ' : ''}${i.firstName} ${i.lastName}`,
          blockRange: `${instrHit.startBlock.startTime}-${instrHit.endBlock.endTime}`,
          when: dateToStr(target),
        },
      });
      return;
    }
    if (groupFamilyIds.length > 0) {
      const groupC = await prisma.scheduleEntry.findMany({
        where: { ...base, studentGroupId: { in: groupFamilyIds } },
        include: { ...blockTimes, studentGroup: { select: { name: true } } },
      });
      const groupHit = hit(groupC);
      if (groupHit) {
        res.status(409).json({
          error: 'GROUP_CONFLICT',
          details: {
            conflictId: groupHit.id,
            label: groupHit.studentGroup?.name ?? 'grupa',
            blockRange: `${groupHit.startBlock.startTime}-${groupHit.endBlock.endTime}`,
            when: dateToStr(target),
          },
        });
        return;
      }
    }
  }

  // Przesuwamy WYLACZNIE terminy — wzorzec tygodnia zostaje nietkniety.
  await prisma.$transaction(
    movable.map(({ entry, target }) =>
      prisma.scheduleEntry.update({
        where: { id: entry.id },
        data: {
          date: target,
          startBlockId: newStartBlockId,
          endBlockId: newEndBlockId,
          roomId: targetRoomId,
          instructorId: targetInstructorId,
        },
      }),
    ),
  );

  const skippedHolidays = futureEntries.length - movable.length;
  res.json({
    data: { updatedCount: movable.length, skippedHolidays },
    message: `Przeniesiono ${movable.length} przyszlych terminow (wzorzec bez zmian)${skippedHolidays > 0 ? `, pominieto ${skippedHolidays} (dni wolne)` : ''}`,
  });
});
