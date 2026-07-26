import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
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
import {
  ColumnHeader,
  DraggableBlock,
  DroppableCell,
  ROW_HEIGHT,
  TimeBlockColumn,
  useScheduleSensors,
} from '@/components/schedule/ScheduleGrid';
import { fetchTemplates, updateTemplate } from '@/api/schedule';
import { fetchEntries, fetchVersions } from '@/api/curriculum';
import { fetchGroups } from '@/api/groups';
import { fetchBuildings } from '@/api/buildings';
import { fetchInstructors } from '@/api/instructors';
import { fetchTimeBlocks } from '@/api/timeBlocks';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import {
  CLASS_COLORS,
  CLASS_LABELS,
  WEEK_TYPE_BADGE,
  daysForMode,
} from '@/lib/scheduleDisplay';
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
import { useAuthStore } from '@/store/authStore';
import { CoverageCard } from './CoverageCard';
import { TemplateDialog } from './TemplateDialog';
import type { DayOfWeek, ScheduleTemplate, StudyMode } from '@/types';

export default function TemplateTab() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'DEAN_OFFICE' || role === 'INSTRUCTOR';
  const { academicYear, semesterType } = useAcademicYearStore();
  const facultyId = useFacultyFilterStore((s) => s.facultyId);

  const sensors = useScheduleSensors();

  const [studyMode, setStudyMode] = useState<StudyMode>('FULL_TIME');
  const [versionId, setVersionId] = useState('');
  const [semester, setSemester] = useState<number | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleTemplate | null>(null);
  const [prefill, setPrefill] = useState<{ dayOfWeek: DayOfWeek; startBlockId: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState('all');
  const [instructorFilter, setInstructorFilter] = useState('all');

  const { data: versions } = useQuery({
    queryKey: ['curriculum-versions'],
    queryFn: fetchVersions,
  });
  const { data: blocks, isPending: blocksPending } = useQuery({
    queryKey: ['time-blocks'],
    queryFn: fetchTimeBlocks,
  });

  // Siatki pasujace do kontekstu: ten rok akademicki, tryb studiow i (opc.) wydzial.
  const availableVersions = useMemo(
    () =>
      versions?.filter(
        (version) =>
          version.academicYear === academicYear &&
          version.studyMode === studyMode &&
          (facultyId === 'all' ||
            version.specialization?.fieldOfStudy?.faculty?.id === facultyId),
      ) ?? [],
    [versions, academicYear, studyMode, facultyId],
  );

  const version = availableVersions.find((item) => item.id === versionId);

  // Semestry tej siatki, ktore wypadaja w wybranym typie semestru (zima/lato).
  const semesterOptions = useMemo(() => {
    if (!version) return [];
    return Array.from({ length: version.totalSemesters }, (_, i) => i + 1).filter(
      (number) => semesterTypeOf(version.startSemesterType, number) === semesterType,
    );
  }, [version, semesterType]);

  // Po zmianie roku/trybu poprzedni wybor bywa nieaktualny — wracamy do pierwszej opcji.
  useEffect(() => {
    if (availableVersions.length === 0) {
      setVersionId('');
    } else if (!availableVersions.some((item) => item.id === versionId)) {
      setVersionId(availableVersions[0]!.id);
    }
  }, [availableVersions, versionId]);

  useEffect(() => {
    if (semesterOptions.length === 0) {
      setSemester(null);
    } else if (semester === null || !semesterOptions.includes(semester)) {
      setSemester(semesterOptions[0]!);
    }
  }, [semesterOptions, semester]);

  const { data: templates, isPending: templatesPending } = useQuery({
    queryKey: ['templates', academicYear, studyMode, semester, version?.specializationId],
    queryFn: () =>
      fetchTemplates({
        academicYear,
        studyMode,
        semester: semester!,
        specializationId: version!.specializationId,
      }),
    enabled: !!version && semester !== null,
  });

  const { data: curriculum } = useQuery({
    queryKey: ['curriculum-entries', versionId],
    queryFn: () => fetchEntries(versionId),
    enabled: !!versionId,
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

  const rooms = useMemo(
    () =>
      buildings?.flatMap((building) =>
        (building.rooms ?? []).map((room) => ({ ...room, buildingName: building.name })),
      ) ?? [],
    [buildings],
  );

  const semesterEntries =
    curriculum?.semesters.find((item) => item.semester === semester)?.entries ?? [];

  // Grupy z rocznika, do ktorego nalezy semestr: semestry 1-2 to rok 1, 3-4 to rok 2 itd.
  const studyYear = semester ? Math.ceil(semester / 2) : null;
  const relevantGroups = useMemo(
    () => groups?.filter((group) => group.studyYear === studyYear) ?? [],
    [groups, studyYear],
  );

  const days = daysForMode(studyMode);

  // Niezalezne filtry Sala/Prowadzacy — ograniczaja TYLKO to, co widac na siatce.
  // Konflikty (podpowiedz przy przeciaganiu) liczymy dalej z pelnych danych.
  const visibleTemplates = useMemo(
    () =>
      templates?.filter(
        (template) =>
          (roomFilter === 'all' || template.room.id === roomFilter) &&
          (instructorFilter === 'all' || template.instructor.id === instructorFilter),
      ) ?? [],
    [templates, roomFilter, instructorFilter],
  );

  const activeTemplate = templates?.find((item) => item.id === activeId) ?? null;

  // Dla przeciaganego bloku: ktore komorki (dzien::blok) sa wolne, a ktore koliduja
  // z sala/prowadzacym/grupa (cala rodzina) innego wzorca w tym roku akademickim.
  // Podglad wizualny — ostateczna walidacja zawsze dzieje sie na backendzie przy zapisie.
  const cellAvailability = useMemo(() => {
    if (!activeTemplate || !blocks) return null;

    const span = activeTemplate.endBlock.order - activeTemplate.startBlock.order;
    const familyIds = activeTemplate.studentGroup
      ? getGroupFamilyIds(activeTemplate.studentGroup.id, groups ?? [])
      : [];
    const others = (allTemplates ?? []).filter((t) => t.id !== activeTemplate.id);

    const map = new Map<string, boolean>();
    for (const day of days) {
      for (const startBlock of blocks) {
        const endBlock = blocks.find((b) => b.order === startBlock.order + span);
        let available = !!endBlock && isTimeWindowOk(DAY_TO_NUM[day.key], startBlock.startTime, studyMode);

        if (available && endBlock) {
          const sameDay = others.filter((t) => t.dayOfWeek === day.key);
          const conflict = sameDay.some((t) => {
            if (!weekTypesConflict(t.weekType, activeTemplate.weekType)) return false;
            if (!rangesOverlap(startBlock.order, endBlock.order, t.startBlock.order, t.endBlock.order)) {
              return false;
            }
            return (
              t.room.id === activeTemplate.room.id ||
              t.instructor.id === activeTemplate.instructor.id ||
              (t.studentGroup && familyIds.includes(t.studentGroup.id))
            );
          });
          available = !conflict;
        }

        map.set(`${day.key}::${startBlock.id}`, available);
      }
    }
    return map;
  }, [activeTemplate, allTemplates, blocks, days, groups, studyMode]);

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

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));
  const onDragCancel = () => setActiveId(null);

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !blocks) return;

    const template = templates?.find((item) => item.id === active.id);
    if (!template) return;

    // id komorki ma format "DZIEN::idBloku" (patrz DroppableCell).
    const [dayKey, blockId] = String(over.id).split('::');
    if (!dayKey || !blockId) return;

    const newStart = blocks.find((block) => block.id === blockId);
    if (!newStart) return;

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

        <Select value={versionId} onValueChange={setVersionId} disabled={availableVersions.length === 0}>
          <SelectTrigger className="w-72" aria-label="Siatka godzin">
            <SelectValue placeholder="Brak siatek dla tego roku i trybu" />
          </SelectTrigger>
          <SelectContent>
            {availableVersions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.specialization?.name ?? 'Siatka'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={semester ? String(semester) : ''}
          onValueChange={(value) => setSemester(Number(value))}
          disabled={semesterOptions.length === 0}
        >
          <SelectTrigger className="w-36" aria-label="Semestr">
            <SelectValue placeholder="Semestr" />
          </SelectTrigger>
          <SelectContent>
            {semesterOptions.map((number) => (
              <SelectItem key={number} value={String(number)}>
                Semestr {number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canEdit && semester !== null && (
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
      </div>

      {!version || semester === null ? (
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
          <CoverageCard curriculumVersionId={versionId} semester={semester} />

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
            onDragCancel={onDragCancel}
            onDragEnd={onDragEnd}
          >
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

          {semesterEntries.length === 0 && (
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
        semester={semester ?? 1}
        studyMode={studyMode}
        curriculumEntries={semesterEntries}
        groups={relevantGroups}
        prefill={prefill}
        editing={editing}
      />
    </div>
  );
}
