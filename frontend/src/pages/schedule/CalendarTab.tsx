import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Pin,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AcademicYearSelector } from '@/components/AcademicYearSelector';
import { FieldOfStudySelector } from '@/components/FieldOfStudySelector';
import {
  ColumnHeader,
  DraggableBlock,
  DropPreview,
  DroppableCell,
  ROW_HEIGHT,
  TimeBlockColumn,
  useScheduleSensors,
} from '@/components/schedule/ScheduleGrid';
import { fetchCalendars, fetchEntries, fetchHolidays, moveEntry } from '@/api/schedule';
import { fetchVersions, fetchEntries as fetchCurriculumEntries } from '@/api/curriculum';
import { semesterTypeOf } from '@/lib/semester';
import { fetchGroups } from '@/api/groups';
import { fetchBuildings } from '@/api/buildings';
import { fetchInstructors } from '@/api/instructors';
import { fetchTimeBlocks } from '@/api/timeBlocks';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import { CLASS_COLORS, CLASS_FULL_LABELS, CLASS_LABELS, CLASS_TYPES, daysForMode } from '@/lib/scheduleDisplay';
import { getGroupFamilyIds, isTimeWindowOk, rangesOverlap } from '@/lib/scheduleConflicts';
import type { PlanScope } from '@/lib/planScope';
import { STUDY_MODES, STUDY_MODE_LABELS } from '@/lib/labels';
import {
  addDays,
  dayOfWeekOf,
  formatDayShort,
  formatWeekRange,
  startOfWeek,
  toDateKey,
  weekDates,
} from '@/lib/scheduleDates';
import { useAuthStore } from '@/store/authStore';
import { useAcademicYearStore } from '@/store/academicYearStore';
import { useFacultyFilterStore } from '@/store/facultyStore';
import { useFieldFilterStore } from '@/store/fieldFilterStore';
import { useCalendarFilterStore } from '@/store/scheduleFilterStore';
import { ClearPlanDialog } from './ClearPlanDialog';
import { CoverageCard } from './CoverageCard';
import { EntryDialog } from './EntryDialog';
import { EntryCreateDialog } from './EntryCreateDialog';
import { GenerateDialog } from './GenerateDialog';
import { cn } from '@/lib/utils';
import type { Instructor, ScheduleEntry, StudyMode } from '@/types';

export default function CalendarTab() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'DEAN_OFFICE' || role === 'INSTRUCTOR';
  const canGenerate = role === 'ADMIN' || role === 'DEAN_OFFICE';
  const { academicYear, semesterType } = useAcademicYearStore();
  const facultyId = useFacultyFilterStore((s) => s.facultyId);
  const fieldOfStudyId = useFieldFilterStore((s) => s.fieldOfStudyId);

  const sensors = useScheduleSensors();

  // Filtry trwale (przezywaja wyjscie na inny widok i powrot) — patrz scheduleFilterStore.
  const {
    studyMode,
    versionFilter,
    semesterFilter,
    roomFilter,
    instructorFilter,
    classTypeFilter,
    groupFilter,
    set: setFilters,
  } = useCalendarFilterStore();
  const setStudyMode = (value: StudyMode) => setFilters({ studyMode: value });
  const setVersionFilter = (value: string) => setFilters({ versionFilter: value });
  const setSemesterFilter = (value: number | 'all') => setFilters({ semesterFilter: value });
  const setRoomFilter = (value: string) => setFilters({ roomFilter: value });
  const setInstructorFilter = (value: string) => setFilters({ instructorFilter: value });
  const setClassTypeFilter = (value: string) => setFilters({ classTypeFilter: value });
  const setGroupFilter = (value: string) => setFilters({ groupFilter: value });

  const [monday, setMonday] = useState(() => startOfWeek(new Date()));
  // Trzymamy tylko id, a obiekt wyprowadzamy z zywych danych — inaczej po zmianie statusu
  // dialog pokazywalby migawke sprzed odswiezenia (status stary, mimo udanej zmiany).
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<{ date: string; startBlockId?: string } | null>(
    null,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const days = daysForMode(studyMode);
  const allWeekDates = weekDates(monday);
  // Pokazujemy tylko te dni tygodnia, w ktorych dany tryb studiow w ogole ma zajecia.
  const visibleDates = allWeekDates.filter((date) =>
    days.some((day) => day.key === dayOfWeekOf(date)),
  );

  const from = toDateKey(monday);
  const to = toDateKey(addDays(monday, 6));

  const { data: calendars } = useQuery({ queryKey: ['semester-calendars'], queryFn: fetchCalendars });

  // Poczatek wybranego semestru: z kalendarza wydzialu (rok + typ + tryb), awaryjnie
  // wyliczony z roku — tak samo jak na backendzie (resolveSemesterRange).
  const semesterStart = useMemo(() => {
    const match = calendars?.find(
      (c) =>
        c.academicYear === academicYear &&
        c.semesterType === semesterType &&
        c.studyMode === studyMode &&
        facultyId !== 'all' &&
        c.facultyId === facultyId,
    );
    if (match) return startOfWeek(new Date(match.startDate));
    const firstYear = parseInt(academicYear.split('/')[0] ?? '', 10);
    if (!firstYear) return null;
    // WINTER -> 1 pazdziernika roku poczatkowego, SUMMER -> ~17 lutego roku nastepnego.
    const fallback =
      semesterType === 'WINTER'
        ? new Date(Date.UTC(firstYear, 9, 1))
        : new Date(Date.UTC(firstYear + 1, 1, 17));
    return startOfWeek(fallback);
  }, [calendars, academicYear, semesterType, studyMode, facultyId]);

  // Zmiana roku/semestru/trybu ustawia widok na poczatek tego semestru. Reczna nawigacja
  // tygodniami zostaje — efekt odpala sie tylko gdy zmieni sie ktorys z tych filtrow.
  useEffect(() => {
    if (semesterStart) setMonday(semesterStart);
  }, [semesterStart]);

  // Zakres dat semestru z kalendarza wydzialu (dokladne granice, nie zaokraglone do tygodnia).
  // Dni poza tym zakresem wygaszamy — generator i tak nic na nich nie rozpisze. null =
  // brak kalendarza dla tego kontekstu (wtedy zakres jest przyblizony, wiec nie wygaszamy).
  const semesterRange = useMemo(() => {
    const match = calendars?.find(
      (c) =>
        c.academicYear === academicYear &&
        c.semesterType === semesterType &&
        c.studyMode === studyMode &&
        facultyId !== 'all' &&
        c.facultyId === facultyId,
    );
    if (!match) return null;
    return { startKey: toDateKey(match.startDate), endKey: toDateKey(match.endDate) };
  }, [calendars, academicYear, semesterType, studyMode, facultyId]);

  const { data: blocks, isPending: blocksPending } = useQuery({
    queryKey: ['time-blocks'],
    queryFn: fetchTimeBlocks,
  });
  // Wydzial zawezamy po stronie serwera (ScheduleEntry ma wlasny facultyId), wiec
  // terminy bez grupy studenckiej tez sa poprawnie przypisane.
  const { data: entries, isPending: entriesPending } = useQuery({
    queryKey: ['schedule-entries', from, to, facultyId],
    queryFn: () => fetchEntries({ from, to, ...(facultyId === 'all' ? {} : { facultyId }) }),
  });
  // Zaznaczony termin liczymy z aktualnych danych, zeby dialog zawsze mial swiezy status.
  const selectedEntry = entries?.find((e) => e.id === selectedEntryId) ?? null;
  const { data: holidays } = useQuery({
    queryKey: ['holidays', from, to],
    queryFn: () => fetchHolidays({ from, to }),
  });
  // Do wyliczenia "rodziny" grupy (przodkowie/potomkowie) przy podpowiedzi konfliktow.
  const { data: groups } = useQuery({
    queryKey: ['groups', academicYear],
    queryFn: () => fetchGroups({ academicYear }),
  });
  const { data: buildings } = useQuery({ queryKey: ['buildings'], queryFn: fetchBuildings });
  const { data: instructors } = useQuery({ queryKey: ['instructors'], queryFn: fetchInstructors });
  // Siatki (= specjalnosci) — do filtra Specjalnosc, tak samo jak w widoku wzorca tygodnia.
  const { data: versions } = useQuery({
    queryKey: ['curriculum-versions'],
    queryFn: fetchVersions,
  });

  // Wpisy siatki wybranej specjalnosci — potrzebne do listy przedmiotow w oknie recznego dodawania.
  const { data: curriculum } = useQuery({
    queryKey: ['curriculum-entries', versionFilter],
    queryFn: () => fetchCurriculumEntries(versionFilter),
    enabled: versionFilter !== 'all',
  });

  // Siatki pasujace do kontekstu: ten rok, tryb oraz (opc.) wydzial i kierunek — jak w TemplateTab.
  const availableVersions = useMemo(
    () =>
      versions?.filter(
        (version) =>
          version.academicYear === academicYear &&
          version.studyMode === studyMode &&
          (facultyId === 'all' ||
            version.specialization?.fieldOfStudy?.faculty?.id === facultyId) &&
          (fieldOfStudyId === 'all' ||
            version.specialization?.fieldOfStudyId === fieldOfStudyId),
      ) ?? [],
    [versions, academicYear, studyMode, facultyId, fieldOfStudyId],
  );

  // specjalnosc wybranej siatki — po niej filtrujemy terminy (przez curriculumVersion terminu).
  const selectedSpecializationId = useMemo(
    () => availableVersions.find((v) => v.id === versionFilter)?.specializationId ?? null,
    [availableVersions, versionFilter],
  );

  // Semestry do wyboru: dla konkretnej siatki jej wlasne, dla "Wszystkie" — suma z dostepnych.
  const semesterOptions = useMemo(() => {
    const source = availableVersions.filter(
      (v) => versionFilter === 'all' || v.id === versionFilter,
    );
    const set = new Set<number>();
    for (const v of source) {
      for (let i = 1; i <= v.totalSemesters; i++) {
        if (semesterTypeOf(v.startSemesterType, i) === semesterType) set.add(i);
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [availableVersions, versionFilter, semesterType]);

  // Gdy zmiana roku/trybu/wydzialu/kierunku uniewazni wybrana specjalnosc — wracamy na "Wszystkie".
  // Guard `!versions`: dopoki siatki sie laduja, nie ruszamy trwalego (persist) versionFilter.
  useEffect(() => {
    if (!versions) return;
    if (versionFilter !== 'all' && !availableVersions.some((v) => v.id === versionFilter)) {
      setVersionFilter('all');
    }
  }, [versions, availableVersions, versionFilter]);

  // Analogicznie semestr — gdy wypadnie z dostepnych (np. po zmianie typu semestru).
  useEffect(() => {
    if (!versions) return;
    if (semesterFilter !== 'all' && !semesterOptions.includes(semesterFilter)) {
      setSemesterFilter('all');
    }
  }, [versions, semesterOptions, semesterFilter]);

  const rooms = useMemo(
    () =>
      buildings?.flatMap((building) =>
        (building.rooms ?? []).map((room) => ({
          ...room,
          buildingName: building.name,
          facultyId: building.faculty?.id ?? null,
          facultyName: building.faculty?.name ?? null,
        })),
      ) ?? [],
    [buildings],
  );

  // Sale w filtrze pogrupowane po wydziale (przez budynek); bez wydzialu -> sekcja na koncu.
  const roomsByFaculty = useMemo(() => {
    const map = new Map<string, { facultyName: string; items: typeof rooms }>();
    for (const room of rooms) {
      const key = room.facultyId ?? '__none__';
      if (!map.has(key)) map.set(key, { facultyName: room.facultyName ?? 'Bez wydzialu', items: [] });
      map.get(key)!.items.push(room);
    }
    return [...map.entries()]
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === '__none__') return 1;
        if (keyB === '__none__') return -1;
        return a.facultyName.localeCompare(b.facultyName, 'pl');
      })
      .map(([, group]) => group);
  }, [rooms]);

  // Prowadzacy w dropdownie pogrupowani po wydziale; bez wydzialu -> osobna sekcja na koncu.
  const instructorsByFaculty = useMemo(() => {
    const map = new Map<string, { facultyName: string; items: Instructor[] }>();
    for (const instructor of instructors ?? []) {
      const key = instructor.faculty?.id ?? '__none__';
      if (!map.has(key)) {
        map.set(key, { facultyName: instructor.faculty?.name ?? 'Bez wydzialu', items: [] });
      }
      map.get(key)!.items.push(instructor);
    }
    return [...map.entries()]
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === '__none__') return 1;
        if (keyB === '__none__') return -1;
        return a.facultyName.localeCompare(b.facultyName, 'pl');
      })
      .map(([, group]) => group);
  }, [instructors]);

  // Zakres dla operacji na planie (generowanie, czyszczenie) — dokladnie to, co widac
  // w pasku filtrow. Okna go nie dubluja, zeby nie bylo dwoch miejsc ustawiania tego samego.
  const planScope: PlanScope = useMemo(
    () => ({
      fieldOfStudyId,
      specializationId: selectedSpecializationId ?? 'all',
      semester: semesterFilter,
    }),
    [fieldOfStudyId, selectedSpecializationId, semesterFilter],
  );

  // grupa.id -> kierunek.id (fieldOfStudyId).
  const groupFieldMap = useMemo(
    () => new Map((groups ?? []).map((g) => [g.id, g.fieldOfStudyId])),
    [groups],
  );

  // Reczne dodawanie terminu wymaga konkretnej siatki + semestru (stad bierzemy przedmioty i grupy).
  const canAddEntry =
    canEdit && versionFilter !== 'all' && typeof semesterFilter === 'number';

  const semesterEntries = useMemo(
    () =>
      typeof semesterFilter === 'number'
        ? (curriculum?.semesters.find((s) => s.semester === semesterFilter)?.entries ?? [])
        : [],
    [curriculum, semesterFilter],
  );

  // Grupy zawezone do kontekstu okna dodawania: ten sam kierunek + rocznik semestru
  // (1-2 = rok 1, 3-4 = rok 2 itd.) oraz wybrana specjalnosc. Grupy bez podzialu na
  // specjalnosc (specializationId = null) obsluguja caly kierunek, wiec je zostawiamy.
  const relevantGroups = useMemo(() => {
    if (typeof semesterFilter !== 'number' || versionFilter === 'all') return [];
    const version = availableVersions.find((v) => v.id === versionFilter);
    const fieldOfStudyId = version?.specialization?.fieldOfStudyId ?? null;
    const studyYear = Math.ceil(semesterFilter / 2);
    return (
      groups?.filter(
        (g) =>
          g.studyYear === studyYear &&
          g.studyMode === studyMode &&
          g.fieldOfStudyId === fieldOfStudyId &&
          (g.specializationId === null || g.specializationId === selectedSpecializationId),
      ) ?? []
    );
  }, [groups, semesterFilter, versionFilter, availableVersions, selectedSpecializationId, studyMode]);

  // Gdy zmiana kontekstu wyrzuci wybrana grupe poza zakres, cofamy filtr na "Wszystkie grupy".
  // Guard na dane, zeby trwaly groupFilter nie zostal wyczyszczony przed ustaleniem kontekstu.
  useEffect(() => {
    if (!groups || !versions) return;
    if (groupFilter !== 'all' && !relevantGroups.some((group) => group.id === groupFilter)) {
      setGroupFilter('all');
    }
  }, [groups, versions, relevantGroups, groupFilter]);

  // Filtr po grupie obejmuje CALA rodzine (wyklad -> cwiczenia -> lab). null = brak zawezenia.
  const groupFilterFamilyIds = useMemo(
    () => (groupFilter === 'all' ? null : getGroupFamilyIds(groupFilter, groups ?? [])),
    [groupFilter, groups],
  );

  const openCreate = (date: string, startBlockId?: string) => {
    setCreatePrefill({ date, startBlockId });
    setCreateOpen(true);
  };

  // Klik w pusta komorke: dodawanie potrzebuje konkretnej siatki + semestru (stad lista
  // przedmiotow). Bez nich nie otwieramy okna, tylko podpowiadamy, co wybrac.
  const handleCellClick = (date: string, startBlockId: string) => {
    if (!canEdit) return;
    if (!canAddEntry) {
      toast.info('Wybierz specjalnosc i semestr, aby dodac zajecia recznie');
      return;
    }
    openCreate(date, startBlockId);
  };

  // Niezalezne filtry Sala/Prowadzacy + glowny Kierunek — ograniczaja TYLKO wyswietlane
  // terminy. Wydzial jest juz zawezony po stronie serwera. Konflikty (podpowiedz przy
  // przeciaganiu) liczymy dalej z pelnych danych tygodnia.
  const visibleEntries = useMemo(
    () =>
      entries?.filter(
        (entry) =>
          // Tryb studiow NIE jest wlasciwoscia terminu — bierzemy go z siatki. Bez tego
          // warunku przelacznik trybu zmienial tylko kolumny dni, a w piatek zostawaly
          // widoczne zajecia stacjonarne (i to od rana, wbrew oknu niestacjonarnych).
          entry.curriculumEntry.curriculumVersion.studyMode === studyMode &&
          (roomFilter === 'all' || entry.room.id === roomFilter) &&
          (instructorFilter === 'all' || entry.instructor.id === instructorFilter) &&
          (classTypeFilter === 'all' || entry.classType === classTypeFilter) &&
          (fieldOfStudyId === 'all' ||
            (entry.studentGroup != null &&
              groupFieldMap.get(entry.studentGroup.id) === fieldOfStudyId)) &&
          (versionFilter === 'all' ||
            entry.curriculumEntry.curriculumVersion.specializationId ===
              selectedSpecializationId) &&
          (semesterFilter === 'all' || entry.curriculumEntry.semester === semesterFilter) &&
          (groupFilterFamilyIds === null ||
            (entry.studentGroup != null && groupFilterFamilyIds.includes(entry.studentGroup.id))),
      ) ?? [],
    [
      entries,
      studyMode,
      roomFilter,
      instructorFilter,
      classTypeFilter,
      fieldOfStudyId,
      groupFieldMap,
      versionFilter,
      selectedSpecializationId,
      semesterFilter,
      groupFilterFamilyIds,
    ],
  );

  const holidayByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const holiday of holidays ?? []) map.set(toDateKey(holiday.date), holiday.name);
    return map;
  }, [holidays]);

  const activeEntry = entries?.find((item) => item.id === activeId) ?? null;

  // Dla przeciaganego terminu: ktore komorki (data::blok) sa wolne, a ktore koliduja
  // z sala/prowadzacym/grupa (cala rodzina) innego terminu TEGO DNIA. Podglad wizualny —
  // ostateczna walidacja i tak dzieje sie na backendzie przy zapisie.
  const cellAvailability = useMemo(() => {
    if (!activeEntry || !blocks) return null;

    const span = activeEntry.endBlock.order - activeEntry.startBlock.order;
    const familyIds = activeEntry.studentGroup
      ? getGroupFamilyIds(activeEntry.studentGroup.id, groups ?? [])
      : [];
    const others = (entries ?? []).filter(
      (e) => e.id !== activeEntry.id && e.status !== 'CANCELLED',
    );

    const map = new Map<string, boolean>();
    for (const date of visibleDates) {
      const dateKey = toDateKey(date);
      const dayNum = date.getUTCDay();
      const dayEntries = others.filter((e) => toDateKey(e.date) === dateKey);

      for (const startBlock of blocks) {
        const endBlock = blocks.find((b) => b.order === startBlock.order + span);
        let available = !!endBlock && isTimeWindowOk(dayNum, startBlock.startTime, studyMode);

        if (available && endBlock) {
          const conflict = dayEntries.some((e) => {
            if (!rangesOverlap(startBlock.order, endBlock.order, e.startBlock.order, e.endBlock.order)) {
              return false;
            }
            return (
              e.room.id === activeEntry.room.id ||
              e.instructor.id === activeEntry.instructor.id ||
              (e.studentGroup && familyIds.includes(e.studentGroup.id))
            );
          });
          available = !conflict;
        }

        map.set(`${dateKey}::${startBlock.id}`, available);
      }
    }
    return map;
  }, [activeEntry, entries, blocks, visibleDates, groups, studyMode]);

  const moveMutation = useMutation({
    mutationFn: ({
      entry,
      newDate,
      newStartBlockId,
      newEndBlockId,
    }: {
      entry: ScheduleEntry;
      newDate: string;
      newStartBlockId: string;
      newEndBlockId: string;
    }) =>
      // Przeciagniecie dotyczy zawsze jednego terminu — seria idzie przez dialog,
      // zeby przypadkowy ruch myszka nie przestawil calego semestru.
      moveEntry(entry.id, { newDate, newStartBlockId, newEndBlockId, scope: 'ONE' }),
    onSuccess: () => {
      toast.success('Termin przeniesiony');
      void queryClient.invalidateQueries({ queryKey: ['schedule-entries'] });
    },
    onError: (error) => toast.error(getScheduleErrorMessage(error)),
  });

  // Ramka podgladu pod kursorem: gdzie (data + wiersz) i na ilu blokach wyladuje termin.
  // blockCount = pelna dlugosc zajec, wiec przy zajeciach podwojnych podpowiedz obejmuje oba
  // pola, nie jedno. Przycinamy do konca dnia, zeby ramka nie wychodzila poza siatke.
  const dropPreview = useMemo(() => {
    if (!overId || !activeEntry || !blocks) return null;
    const [dateKey, blockId] = overId.split('::');
    const startIndex = blocks.findIndex((b) => b.id === blockId);
    if (!dateKey || startIndex === -1) return null;
    const span = activeEntry.endBlock.order - activeEntry.startBlock.order;
    const blockCount = Math.min(span + 1, blocks.length - startIndex);
    const available = !!cellAvailability?.get(overId);
    return { dateKey, startIndex, blockCount, available };
  }, [overId, activeEntry, blocks, cellAvailability]);

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));
  const onDragOver = (event: DragOverEvent) =>
    setOverId(event.over ? String(event.over.id) : null);
  const onDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setOverId(null);
    const { active, over } = event;
    if (!over || !blocks) return;

    const entry = entries?.find((item) => item.id === active.id);
    if (!entry) return;

    // id komorki: "YYYY-MM-DD::idBloku"
    const [dateKey, blockId] = String(over.id).split('::');
    if (!dateKey || !blockId) return;

    const newStart = blocks.find((block) => block.id === blockId);
    if (!newStart) return;

    const span = entry.endBlock.order - entry.startBlock.order;
    const newEnd = blocks.find((block) => block.order === newStart.order + span);
    if (!newEnd) {
      toast.error('Zajecia nie zmieszcza sie do konca dnia');
      return;
    }
    if (toDateKey(entry.date) === dateKey && entry.startBlock.id === blockId) return;

    moveMutation.mutate({
      entry,
      newDate: dateKey,
      newStartBlockId: newStart.id,
      newEndBlockId: newEnd.id,
    });
  };

  if (blocksPending) return <Skeleton className="h-96 w-full rounded-lg" />;

  if (!blocks || blocks.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDays />
          </EmptyMedia>
          <EmptyTitle>Brak blokow czasowych</EmptyTitle>
          <EmptyDescription>Zdefiniuj siatke godzin w Ustawieniach.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <AcademicYearSelector />

        <Select value={studyMode} onValueChange={(value) => setStudyMode(value as StudyMode)}>
          <SelectTrigger className="w-40" aria-label="Tryb studiow">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STUDY_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {STUDY_MODE_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FieldOfStudySelector />

        <Select
          value={versionFilter}
          onValueChange={setVersionFilter}
          disabled={availableVersions.length === 0}
        >
          <SelectTrigger className="w-72" aria-label="Specjalnosc">
            <SelectValue placeholder="Specjalnosc" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie specjalnosci</SelectItem>
            {availableVersions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.specialization?.name ?? 'Siatka'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(semesterFilter)}
          onValueChange={(value) => setSemesterFilter(value === 'all' ? 'all' : Number(value))}
          disabled={semesterOptions.length === 0}
        >
          <SelectTrigger className="w-40" aria-label="Semestr">
            <SelectValue placeholder="Semestr" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie semestry</SelectItem>
            {semesterOptions.map((number) => (
              <SelectItem key={number} value={String(number)}>
                Semestr {number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={groupFilter} onValueChange={setGroupFilter} disabled={relevantGroups.length === 0}>
          <SelectTrigger className="w-56" aria-label="Grupa">
            <SelectValue placeholder="Grupa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie grupy</SelectItem>
            {relevantGroups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          {canAddEntry && (
            <Button onClick={() => openCreate(from)}>
              <Plus />
              Dodaj zajecia
            </Button>
          )}
          {canGenerate && (
            <Button variant="destructive" onClick={() => setClearOpen(true)}>
              <Trash2 />
              Usun plan
            </Button>
          )}
          {canGenerate && (
            <Button onClick={() => setGenerateOpen(true)}>
              <Sparkles />
              Generuj semestr
            </Button>
          )}
        </div>
      </div>

      {/* Niezalezne filtry — zawezaja co widac na siatce, nie zmieniaja kontekstu (rok/tryb). */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={roomFilter} onValueChange={setRoomFilter}>
          <SelectTrigger className="w-56" aria-label="Sala">
            <SelectValue placeholder="Sala" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie sale</SelectItem>
            {roomsByFaculty.map((group) => (
              <SelectGroup key={group.facultyName}>
                <SelectLabel>{group.facultyName}</SelectLabel>
                {group.items.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.buildingName} · {room.number}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <Select value={instructorFilter} onValueChange={setInstructorFilter}>
          <SelectTrigger className="w-56" aria-label="Prowadzacy">
            <SelectValue placeholder="Prowadzacy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszyscy prowadzacy</SelectItem>
            {instructorsByFaculty.map((group) => (
              <SelectGroup key={group.facultyName}>
                <SelectLabel>{group.facultyName}</SelectLabel>
                {group.items.map((instructor) => (
                  <SelectItem key={instructor.id} value={instructor.id}>
                    {`${instructor.title ? instructor.title + ' ' : ''}${instructor.firstName} ${instructor.lastName}`}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <Select value={classTypeFilter} onValueChange={setClassTypeFilter}>
          <SelectTrigger className="w-56" aria-label="Forma zajec">
            <SelectValue placeholder="Forma zajec" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie formy</SelectItem>
            {CLASS_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {CLASS_FULL_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bilans pokrycia semestru liczymy dla JEDNEJ siatki + semestru, wiec pokazujemy go tylko
          gdy filtry sa zawezone do konkretnej specjalnosci i semestru (nie "Wszystkie"). */}
      {versionFilter !== 'all' && semesterFilter !== 'all' && (
        <CoverageCard curriculumVersionId={versionFilter} semester={semesterFilter} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Poprzedni tydzien" onClick={() => setMonday(addDays(monday, -7))}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon" aria-label="Nastepny tydzien" onClick={() => setMonday(addDays(monday, 7))}>
          <ChevronRight />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setMonday(startOfWeek(new Date()))}>
          Biezacy tydzien
        </Button>
        <span className="text-sm font-medium tabular-nums">{formatWeekRange(monday)}</span>
        {entriesPending && <Skeleton className="h-4 w-24" />}
        {!entriesPending && (
          <Badge variant="secondary">{visibleEntries.length} zajec w tym tygodniu</Badge>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        <div className="overflow-x-auto rounded-lg border">
          <div className="flex min-w-max">
            <TimeBlockColumn blocks={blocks} />

            {visibleDates.map((date) => {
              const dateKey = toDateKey(date);
              const holidayName = holidayByDate.get(dateKey);
              // Dzien poza zakresem semestru (przed poczatkiem albo po koncu kalendarza wydzialu).
              const outOfRange =
                semesterRange !== null &&
                (dateKey < semesterRange.startKey || dateKey > semesterRange.endKey);
              const dayEntries = visibleEntries.filter(
                (entry) => toDateKey(entry.date) === dateKey,
              );
              const isToday = dateKey === toDateKey(new Date());
              const label = date.toLocaleDateString('pl-PL', { weekday: 'short' });

              return (
                <div key={dateKey} className="min-w-44 flex-1 border-r last:border-r-0">
                  <ColumnHeader
                    title={`${label} ${formatDayShort(date)}`}
                    subtitle={holidayName ?? (outOfRange ? 'Poza semestrem' : undefined)}
                    highlighted={isToday}
                  />
                  <div
                    className={cn(
                      'relative',
                      holidayName && 'bg-muted/40',
                      // Poza semestrem — kolumna wyraznie szara; generator i tak nic tu nie rozpisze.
                      outOfRange && 'bg-muted/60',
                    )}
                    style={{ height: blocks.length * ROW_HEIGHT, minHeight: ROW_HEIGHT }}
                  >
                    {blocks.map((block, rowIndex) => (
                      <DroppableCell
                        key={block.id}
                        id={`${dateKey}::${block.id}`}
                        rowIndex={rowIndex}
                        disabled={!canEdit || outOfRange}
                        availability={
                          // Poza semestrem nie kolorujemy dostepnosci (czerwony/zielony) —
                          // dzien ma zostac po prostu szary.
                          outOfRange
                            ? undefined
                            : cellAvailability
                              ? cellAvailability.get(`${dateKey}::${block.id}`)
                                ? 'available'
                                : 'unavailable'
                              : undefined
                        }
                        onClick={
                          canEdit && !outOfRange ? () => handleCellClick(dateKey, block.id) : undefined
                        }
                      />
                    ))}

                    {dropPreview?.dateKey === dateKey && (
                      <DropPreview
                        startRowIndex={dropPreview.startIndex}
                        blockCount={dropPreview.blockCount}
                        available={dropPreview.available}
                      />
                    )}

                    {dayEntries.map((entry) => {
                      const startIndex = blocks.findIndex((block) => block.id === entry.startBlock.id);
                      if (startIndex === -1) return null;
                      const span = entry.endBlock.order - entry.startBlock.order + 1;
                      const cancelled = entry.status === 'CANCELLED';

                      return (
                        <DraggableBlock
                          key={entry.id}
                          id={entry.id}
                          startRowIndex={startIndex}
                          blockCount={span}
                          colorClass={cn(
                            CLASS_COLORS[entry.classType],
                            // Odwolane zajecia zostaja widoczne, ale wyraznie wyciszone.
                            cancelled && 'opacity-50 line-through',
                            // Termin poza zakresem semestru — szary (odbarwiony), bo i tak
                            // nie nalezy do tego semestru.
                            outOfRange && 'grayscale opacity-60',
                          )}
                          disabled={!canEdit}
                          onClick={() => setSelectedEntryId(entry.id)}
                        >
                          <div className="font-medium">
                            {/* Odczepiony termin — pinezka sygnalizuje, ze nie idzie za seria. */}
                            {entry.detached && (
                              <Pin className="mr-1 inline size-3 -translate-y-px" aria-label="odczepiony" />
                            )}
                            {CLASS_LABELS[entry.classType]} · {entry.curriculumEntry.subject.name}
                          </div>
                          <div className="opacity-80">
                            {entry.room.number} · {entry.instructor.lastName}
                          </div>
                          {entry.studentGroup && (
                            <div className="opacity-80">{entry.studentGroup.name}</div>
                          )}
                        </DraggableBlock>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DndContext>

      {/* Liczymy po terminach widocznych, nie po calym tygodniu — inaczej przy trybie bez
          rozpisanego planu siatka zostawala pusta bez zadnego wyjasnienia. */}
      {!entriesPending && visibleEntries.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarOff />
            </EmptyMedia>
            <EmptyTitle>Pusty tydzien</EmptyTitle>
            <EmptyDescription>
              W tym tygodniu nie ma zadnych terminow. Ulozy wzorzec tygodnia i uzyj przycisku
              „Generuj semestr", zeby rozpisac go na daty.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <EntryDialog
        entry={selectedEntry}
        onOpenChange={(open) => !open && setSelectedEntryId(null)}
        canEdit={canEdit}
        semesterRange={semesterRange}
      />

      <ClearPlanDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        academicYear={academicYear}
        semesterType={semesterType}
        studyMode={studyMode}
        facultyId={facultyId}
        scope={planScope}
        defaultTarget="entries"
      />

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        academicYear={academicYear}
        semesterType={semesterType}
        studyMode={studyMode}
        facultyId={facultyId}
        scope={planScope}
      />

      <EntryCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        studyMode={studyMode}
        curriculumEntries={semesterEntries}
        groups={relevantGroups}
        prefill={createPrefill}
      />
    </div>
  );
}
