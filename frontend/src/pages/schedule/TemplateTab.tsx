import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CalendarDays, Info, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
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
import { fetchCalendars, fetchTemplates, updateTemplate } from '@/api/schedule';
import { fetchEntries, fetchVersions } from '@/api/curriculum';
import { fetchGroups } from '@/api/groups';
import { fetchBuildings } from '@/api/buildings';
import { fetchInstructors } from '@/api/instructors';
import { fetchTimeBlocks } from '@/api/timeBlocks';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import {
  CLASS_COLORS,
  CLASS_FULL_LABELS,
  CLASS_LABELS,
  CLASS_TYPES,
  MAX_TEMPLATE_BLOCKS,
  WEEK_TYPE_BADGE,
  daysForMode,
} from '@/lib/scheduleDisplay';
import { computeUnplannedItems, suggestedBlockCount } from '@/lib/unplannedItems';
import {
  DAY_TO_NUM,
  getGroupFamilyIds,
  isTimeWindowOk,
  rangesOverlap,
  weekTypesConflict,
} from '@/lib/scheduleConflicts';
import { STUDY_MODES, STUDY_MODE_LABELS } from '@/lib/labels';
import { semesterTypeOf } from '@/lib/semester';
import { useAcademicYearStore } from '@/store/academicYearStore';
import { useFacultyFilterStore } from '@/store/facultyStore';
import { useFieldFilterStore } from '@/store/fieldFilterStore';
import { useAuthStore } from '@/store/authStore';
import { TemplateDialog, type TemplatePrefill } from './TemplateDialog';
import { UnplannedPanel } from './UnplannedPanel';
import type { DayOfWeek, ScheduleTemplate, StudyMode, WeekType } from '@/types';

export default function TemplateTab() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'DEAN_OFFICE' || role === 'INSTRUCTOR';
  const { academicYear, semesterType } = useAcademicYearStore();
  const facultyId = useFacultyFilterStore((s) => s.facultyId);
  const fieldOfStudyId = useFieldFilterStore((s) => s.fieldOfStudyId);

  const sensors = useScheduleSensors();

  const [studyMode, setStudyMode] = useState<StudyMode>('FULL_TIME');
  // versionId: konkretna siatka (= specjalnosc w tym roku+trybie), 'all' = wszystkie, '' = brak.
  const [versionId, setVersionId] = useState('');
  // semester: konkretny numer, 'all' = wszystkie, null = brak dostepnych.
  const [semester, setSemester] = useState<number | 'all' | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleTemplate | null>(null);
  const [prefill, setPrefill] = useState<TemplatePrefill | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState('all');
  const [instructorFilter, setInstructorFilter] = useState('all');
  const [classTypeFilter, setClassTypeFilter] = useState('all');

  const { data: versions } = useQuery({
    queryKey: ['curriculum-versions'],
    queryFn: fetchVersions,
  });
  const { data: blocks, isPending: blocksPending } = useQuery({
    queryKey: ['time-blocks'],
    queryFn: fetchTimeBlocks,
  });

  // Siatki pasujace do kontekstu: ten rok akademicki, tryb studiow oraz (opc.) wydzial i kierunek.
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

  const version = availableVersions.find((item) => item.id === versionId);
  const allSpecializations = versionId === 'all';

  // Semestry do wyboru: dla konkretnej siatki jej wlasne, dla "Wszystkie" — suma z
  // wszystkich dostepnych siatek (rozne moga miec inna liczbe/uklad semestrow).
  const semesterOptions = useMemo(() => {
    const source = version ? [version] : allSpecializations ? availableVersions : [];
    const set = new Set<number>();
    for (const v of source) {
      for (let i = 1; i <= v.totalSemesters; i++) {
        if (semesterTypeOf(v.startSemesterType, i) === semesterType) set.add(i);
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [version, allSpecializations, availableVersions, semesterType]);

  // Po zmianie roku/trybu poprzedni wybor bywa nieaktualny — wracamy do pierwszej opcji.
  // 'all' (wszystkie specjalnosci) zostawiamy nietkniete, dopoki sa jakiekolwiek siatki.
  useEffect(() => {
    if (availableVersions.length === 0) {
      setVersionId('');
    } else if (versionId !== 'all' && !availableVersions.some((item) => item.id === versionId)) {
      setVersionId(availableVersions[0]!.id);
    }
  }, [availableVersions, versionId]);

  useEffect(() => {
    if (semester === 'all') return; // "Wszystkie semestry" jest zawsze wazne
    if (semesterOptions.length === 0) {
      setSemester(null);
    } else if (semester === null || !semesterOptions.includes(semester)) {
      setSemester(semesterOptions[0]!);
    }
  }, [semesterOptions, semester]);

  const { data: templates, isPending: templatesPending } = useQuery({
    queryKey: [
      'templates',
      academicYear,
      studyMode,
      semester,
      allSpecializations ? `field:${fieldOfStudyId}` : version?.specializationId,
    ],
    queryFn: () =>
      fetchTemplates({
        academicYear,
        studyMode,
        ...(semester !== 'all' && semester !== null ? { semester } : {}),
        // Konkretna siatka -> po specjalnosci; "Wszystkie" -> ewentualnie po kierunku (filtr Kierunek).
        ...(allSpecializations
          ? fieldOfStudyId !== 'all'
            ? { fieldOfStudyId }
            : {}
          : { specializationId: version!.specializationId }),
      }),
    enabled: (allSpecializations || !!version) && semester !== null,
  });

  // Wpisy siatki (do CoverageCard i podpowiedzi w dialogu) maja sens tylko dla konkretnej siatki.
  const { data: curriculum } = useQuery({
    queryKey: ['curriculum-entries', versionId],
    queryFn: () => fetchEntries(versionId),
    enabled: !allSpecializations && !!versionId,
  });

  const { data: groups } = useQuery({
    queryKey: ['groups', academicYear],
    queryFn: () => fetchGroups({ academicYear }),
  });

  // Konflikty (sala/prowadzacy/grupa) sprawdzamy globalnie dla calego roku, bo backend
  // tez tak robi — nie tylko w obrebie aktualnie wybranego semestru/trybu/siatki.
  const { data: allTemplates } = useQuery({
    queryKey: ['templates', 'all', academicYear],
    queryFn: () => fetchTemplates({ academicYear }),
  });
  const { data: buildings } = useQuery({ queryKey: ['buildings'], queryFn: fetchBuildings });
  const { data: instructors } = useQuery({ queryKey: ['instructors'], queryFn: fetchInstructors });

  // Kalendarz semestru daje `teachingWeeks` — przelicznik godzin semestralnych z siatki
  // na tygodniowe, ktorymi operuje wzorzec. Bez niego backlog dziala w trybie zgrubnym.
  const { data: calendars } = useQuery({ queryKey: ['semester-calendars'], queryFn: fetchCalendars });
  const teachingWeeks =
    calendars?.find(
      (calendar) =>
        calendar.academicYear === academicYear &&
        calendar.semesterType === semesterType &&
        calendar.studyMode === studyMode,
    )?.teachingWeeks ?? null;

  const rooms = useMemo(
    () =>
      buildings?.flatMap((building) =>
        (building.rooms ?? []).map((room) => ({ ...room, buildingName: building.name })),
      ) ?? [],
    [buildings],
  );

  // Memo, bo od tej listy zalezy wyliczanie backlogu — nowa tablica przy kazdym
  // renderze przeliczalaby go bez potrzeby.
  const semesterEntries = useMemo(
    () =>
      typeof semester === 'number'
        ? (curriculum?.semesters.find((item) => item.semester === semester)?.entries ?? [])
        : [],
    [curriculum, semester],
  );

  // Grupy zawezone do kontekstu wzorca: kierunek + rocznik semestru (1-2 = rok 1, 3-4 = rok 2…),
  // tryb studiow oraz wybrana specjalnosc. Grupy bez podzialu na specjalnosc (specializationId =
  // null) obsluguja caly kierunek, wiec je zostawiamy.
  const studyYear = typeof semester === 'number' ? Math.ceil(semester / 2) : null;
  const relevantGroups = useMemo(() => {
    if (studyYear === null || !version) return [];
    const fieldOfStudyId = version.specialization?.fieldOfStudyId ?? null;
    return (
      groups?.filter(
        (group) =>
          group.studyYear === studyYear &&
          group.studyMode === studyMode &&
          group.fieldOfStudyId === fieldOfStudyId &&
          (group.specializationId === null ||
            group.specializationId === version.specializationId),
      ) ?? []
    );
  }, [groups, studyYear, version, studyMode]);

  // Backlog liczymy z PELNEJ listy wzorcow semestru — filtry widoku (sala/prowadzacy/forma)
  // zawezaja tylko to, co widac na siatce, a nie to, co faktycznie jest juz zaplanowane.
  const { items: unplannedItems, missingGroupTypes } = useMemo(
    () =>
      computeUnplannedItems({
        entries: semesterEntries,
        groups: relevantGroups,
        templates: templates ?? [],
        teachingWeeks,
      }),
    [semesterEntries, relevantGroups, templates, teachingWeeks],
  );

  // Panel ma sens tylko dla konkretnej siatki i semestru — inaczej nie wiadomo,
  // czyje godziny liczyc (tak samo jak przy przycisku "Dodaj zajecia").
  const showUnplanned = !allSpecializations && !!version && typeof semester === 'number';

  const days = daysForMode(studyMode);

  // Niezalezne filtry Sala/Prowadzacy — ograniczaja TYLKO to, co widac na siatce.
  // Konflikty (podpowiedz przy przeciaganiu) liczymy dalej z pelnych danych.
  const visibleTemplates = useMemo(
    () =>
      templates?.filter(
        (template) =>
          (roomFilter === 'all' || template.room.id === roomFilter) &&
          (instructorFilter === 'all' || template.instructor.id === instructorFilter) &&
          (classTypeFilter === 'all' || template.classType === classTypeFilter),
      ) ?? [],
    [templates, roomFilter, instructorFilter, classTypeFilter],
  );

  /**
   * Wspolny opis tego, co akurat jedzie pod kursorem — gotowy wzorzec z siatki albo
   * pozycja z backlogu. Dzieki temu podglad kolizji i ramka podpowiedzi maja jedno
   * zrodlo, mimo ze backlog nie zna jeszcze sali ani dokladnej dlugosci zajec.
   */
  const dragSubject = useMemo(() => {
    if (!activeId) return null;

    const template = templates?.find((item) => item.id === activeId);
    if (template) {
      const blockCount = template.endBlock.order - template.startBlock.order + 1;
      return {
        excludeTemplateId: template.id,
        blockCount,
        roomId: template.room.id as string | null,
        instructorId: template.instructor.id as string | null,
        groupId: template.studentGroup?.id ?? null,
        weekType: template.weekType,
      };
    }

    const item = unplannedItems.find((entry) => entry.key === activeId);
    if (item) {
      return {
        excludeTemplateId: null,
        blockCount: suggestedBlockCount(item, MAX_TEMPLATE_BLOCKS),
        // Sale wskaze dopiero dialog, wiec kolizji sal na tym etapie nie sprawdzamy.
        roomId: null,
        instructorId: item.instructorId,
        groupId: item.group.id,
        weekType: 'EVERY' as WeekType,
      };
    }
    return null;
  }, [activeId, templates, unplannedItems]);

  // Dla przeciaganego bloku: ktore komorki (dzien::blok) sa wolne, a ktore koliduja
  // z sala/prowadzacym/grupa (cala rodzina) innego wzorca w tym roku akademickim.
  // Podglad wizualny — ostateczna walidacja zawsze dzieje sie na backendzie przy zapisie.
  const cellAvailability = useMemo(() => {
    if (!dragSubject || !blocks) return null;

    const span = dragSubject.blockCount - 1;
    const familyIds = dragSubject.groupId
      ? getGroupFamilyIds(dragSubject.groupId, groups ?? [])
      : [];
    const others = (allTemplates ?? []).filter((t) => t.id !== dragSubject.excludeTemplateId);

    const map = new Map<string, boolean>();
    for (const day of days) {
      for (const startBlock of blocks) {
        const endBlock = blocks.find((b) => b.order === startBlock.order + span);
        let available = !!endBlock && isTimeWindowOk(DAY_TO_NUM[day.key], startBlock.startTime, studyMode);

        if (available && endBlock) {
          const sameDay = others.filter((t) => t.dayOfWeek === day.key);
          const conflict = sameDay.some((t) => {
            if (!weekTypesConflict(t.weekType, dragSubject.weekType)) return false;
            if (!rangesOverlap(startBlock.order, endBlock.order, t.startBlock.order, t.endBlock.order)) {
              return false;
            }
            return (
              (!!dragSubject.roomId && t.room.id === dragSubject.roomId) ||
              (!!dragSubject.instructorId && t.instructor.id === dragSubject.instructorId) ||
              (!!t.studentGroup && familyIds.includes(t.studentGroup.id))
            );
          });
          available = !conflict;
        }

        map.set(`${day.key}::${startBlock.id}`, available);
      }
    }
    return map;
  }, [dragSubject, allTemplates, blocks, days, groups, studyMode]);

  const moveMutation = useMutation({
    mutationFn: ({
      template,
      dayOfWeek,
      startBlockId,
      endBlockId,
    }: {
      template: ScheduleTemplate;
      dayOfWeek: DayOfWeek;
      startBlockId: string;
      endBlockId: string;
    }) => updateTemplate(template.id, { dayOfWeek, startBlockId, endBlockId }),
    onSuccess: () => {
      toast.success('Termin przeniesiony');
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (error) => toast.error(getScheduleErrorMessage(error)),
  });

  // Ramka podgladu pod kursorem: gdzie (dzien + wiersz) i na ilu blokach wyladuja zajecia.
  // blockCount = pelna dlugosc zajec, wiec przy zajeciach podwojnych podpowiedz obejmuje oba
  // pola, nie jedno. Przycinamy do konca dnia, zeby ramka nie wychodzila poza siatke.
  const dropPreview = useMemo(() => {
    if (!overId || !dragSubject || !blocks) return null;
    const [dayKey, blockId] = overId.split('::');
    const startIndex = blocks.findIndex((b) => b.id === blockId);
    if (!dayKey || startIndex === -1) return null;
    const blockCount = Math.min(dragSubject.blockCount, blocks.length - startIndex);
    const available = !!cellAvailability?.get(overId);
    return { dayKey, startIndex, blockCount, available };
  }, [overId, dragSubject, blocks, cellAvailability]);

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

    // id komorki ma format "DZIEN::idBloku" (patrz DroppableCell).
    const [dayKey, blockId] = String(over.id).split('::');
    if (!dayKey || !blockId) return;

    const newStart = blocks.find((block) => block.id === blockId);
    if (!newStart) return;

    // Pozycja z backlogu nie jest jeszcze wzorcem — nie zna sali, wiec zamiast zapisu
    // otwieramy dialog z tym, co juz wiadomo. Sale planista wskazuje sam.
    const unplanned = unplannedItems.find((item) => item.key === active.id);
    if (unplanned) {
      setEditing(null);
      setPrefill({
        dayOfWeek: dayKey as DayOfWeek,
        startBlockId: newStart.id,
        curriculumEntryId: unplanned.curriculumEntryId,
        classType: unplanned.classType,
        studentGroupId: unplanned.group.id,
        ...(unplanned.instructorId ? { instructorId: unplanned.instructorId } : {}),
        blockCount: suggestedBlockCount(unplanned, MAX_TEMPLATE_BLOCKS),
      });
      setDialogOpen(true);
      return;
    }

    const template = templates?.find((item) => item.id === active.id);
    if (!template) return;

    // Dlugosc zajec zostaje bez zmian — przeciagniecie zmienia tylko poczatek.
    const span = template.endBlock.order - template.startBlock.order;
    const newEnd = blocks.find((block) => block.order === newStart.order + span);
    if (!newEnd) {
      toast.error('Zajecia nie zmieszcza sie do konca dnia');
      return;
    }
    if (template.dayOfWeek === dayKey && template.startBlock.id === blockId) return;

    moveMutation.mutate({
      template,
      dayOfWeek: dayKey as DayOfWeek,
      startBlockId: newStart.id,
      endBlockId: newEnd.id,
    });
  };

  const openCreate = (dayOfWeek: DayOfWeek, startBlockId: string) => {
    setEditing(null);
    setPrefill({ dayOfWeek, startBlockId });
    setDialogOpen(true);
  };

  const openEdit = (template: ScheduleTemplate) => {
    setPrefill(null);
    setEditing(template);
    setDialogOpen(true);
  };

  if (blocksPending) {
    return <Skeleton className="h-96 w-full rounded-lg" />;
  }

  if (!blocks || blocks.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDays />
          </EmptyMedia>
          <EmptyTitle>Brak siatki godzin</EmptyTitle>
          <EmptyDescription>
            Najpierw zdefiniuj bloki czasowe w Ustawieniach — bez nich nie ma na czym ustawiac zajec.
          </EmptyDescription>
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

        <Select value={versionId} onValueChange={setVersionId} disabled={availableVersions.length === 0}>
          <SelectTrigger className="w-72" aria-label="Specjalnosc">
            <SelectValue placeholder="Brak specjalnosci dla tego roku i trybu" />
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
          value={semester === null ? '' : String(semester)}
          onValueChange={(value) => setSemester(value === 'all' ? 'all' : Number(value))}
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

        {/* Dodawanie wymaga konkretnej siatki i semestru — dialog czerpie z nich liste przedmiotow. */}
        {canEdit && !allSpecializations && typeof semester === 'number' && (
          <Button className="ml-auto" onClick={() => openCreate(days[0]!.key, blocks[0]!.id)}>
            <Plus />
            Dodaj zajecia
          </Button>
        )}
      </div>

      {/* Niezalezne filtry — zawezaja co widac na siatce, nie zmieniaja kontekstu (rok/tryb/siatka). */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={roomFilter} onValueChange={setRoomFilter}>
          <SelectTrigger className="w-56" aria-label="Sala">
            <SelectValue placeholder="Sala" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie sale</SelectItem>
            {rooms.map((room) => (
              <SelectItem key={room.id} value={room.id}>
                {room.buildingName} · {room.number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={instructorFilter} onValueChange={setInstructorFilter}>
          <SelectTrigger className="w-56" aria-label="Prowadzacy">
            <SelectValue placeholder="Prowadzacy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszyscy prowadzacy</SelectItem>
            {instructors?.map((instructor) => (
              <SelectItem key={instructor.id} value={instructor.id}>
                {`${instructor.title ? instructor.title + ' ' : ''}${instructor.firstName} ${instructor.lastName}`}
              </SelectItem>
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

      {(!version && !allSpecializations) || semester === null ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDays />
            </EmptyMedia>
            <EmptyTitle>Nie ma czego planowac</EmptyTitle>
            <EmptyDescription>
              Dla roku {academicYear} i tego trybu nie ma siatki godzin z semestrem{' '}
              {semesterType === 'WINTER' ? 'zimowym' : 'letnim'}. Utworz ja w zakladce Siatka godzin.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {studyMode === 'PART_TIME' && (
            <Alert>
              <Info />
              <AlertTitle>Studia niestacjonarne</AlertTitle>
              <AlertDescription>
                Zajecia mozna ustawiac tylko w piatek od 15:00 oraz w sobote i niedziele — backend
                odrzuci termin poza tym oknem.
              </AlertDescription>
            </Alert>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragCancel={onDragCancel}
            onDragEnd={onDragEnd}
          >
            {/* Wewnatrz DndContext, bo kafelki backlogu sa zrodlem przeciagania na siatke. */}
            {showUnplanned && (
              <div className="mb-4">
                <UnplannedPanel
                  items={unplannedItems}
                  missingGroupTypes={missingGroupTypes}
                  disabled={!canEdit}
                />
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
              <div className="flex min-w-max">
                <TimeBlockColumn blocks={blocks} />

                {days.map((day) => {
                  const dayTemplates = visibleTemplates.filter(
                    (template) => template.dayOfWeek === day.key,
                  );

                  return (
                    <div key={day.key} className="min-w-44 flex-1 border-r last:border-r-0">
                      <ColumnHeader title={day.label} />
                      <div
                        className="relative"
                        style={{ height: blocks.length * ROW_HEIGHT, minHeight: ROW_HEIGHT }}
                      >
                        {blocks.map((block, rowIndex) => (
                          <DroppableCell
                            key={block.id}
                            id={`${day.key}::${block.id}`}
                            rowIndex={rowIndex}
                            disabled={!canEdit}
                            availability={
                              cellAvailability
                                ? cellAvailability.get(`${day.key}::${block.id}`)
                                  ? 'available'
                                  : 'unavailable'
                                : undefined
                            }
                            onClick={canEdit ? () => openCreate(day.key, block.id) : undefined}
                          />
                        ))}

                        {dropPreview?.dayKey === day.key && (
                          <DropPreview
                            startRowIndex={dropPreview.startIndex}
                            blockCount={dropPreview.blockCount}
                            available={dropPreview.available}
                          />
                        )}

                        {dayTemplates.map((template) => {
                          const startIndex = blocks.findIndex(
                            (block) => block.id === template.startBlock.id,
                          );
                          if (startIndex === -1) return null;
                          const span =
                            template.endBlock.order - template.startBlock.order + 1;

                          return (
                            <DraggableBlock
                              key={template.id}
                              id={template.id}
                              startRowIndex={startIndex}
                              blockCount={span}
                              colorClass={CLASS_COLORS[template.classType]}
                              disabled={!canEdit}
                              onClick={() => openEdit(template)}
                            >
                              <div className="line-clamp-2 font-medium">
                                {CLASS_LABELS[template.classType]} ·{' '}
                                {template.curriculumEntry.subject.name}
                              </div>
                              <div className="opacity-80">
                                {template.room.number} · {template.instructor.lastName}
                              </div>
                              {template.studentGroup && (
                                <div className="opacity-80">{template.studentGroup.name}</div>
                              )}
                              {/* A/B tylko dla zajec co drugi tydzien — "co tydzien" nie zasmieca kafelka. */}
                              {template.weekType !== 'EVERY' && (
                                <div className="mt-0.5">
                                  <span className="rounded bg-black/10 px-1 py-px text-[10px] font-medium dark:bg-white/15">
                                    {WEEK_TYPE_BADGE[template.weekType]}
                                  </span>
                                </div>
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

          {!templatesPending && templates?.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Ten semestr nie ma jeszcze zadnych zajec — kliknij w pusta komorke siatki, zeby dodac
              pierwsze.
            </p>
          )}

          {!allSpecializations && typeof semester === 'number' && semesterEntries.length === 0 && (
            <Badge variant="outline" className="w-fit">
              Uwaga: semestr {semester} tej siatki nie ma zadnych przedmiotow
            </Badge>
          )}
        </>
      )}

      <TemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        academicYear={academicYear}
        semester={typeof semester === 'number' ? semester : 1}
        studyMode={studyMode}
        curriculumEntries={semesterEntries}
        groups={relevantGroups}
        prefill={prefill}
        editing={editing}
      />
    </div>
  );
}
