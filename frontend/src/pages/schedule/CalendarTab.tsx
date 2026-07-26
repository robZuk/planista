import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { CalendarDays, CalendarOff, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
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
import { fetchEntries, fetchHolidays, moveEntry } from '@/api/schedule';
import { fetchGroups } from '@/api/groups';
import { fetchBuildings } from '@/api/buildings';
import { fetchInstructors } from '@/api/instructors';
import { fetchFieldsOfStudy } from '@/api/fieldsOfStudy';
import { fetchTimeBlocks } from '@/api/timeBlocks';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import { CLASS_COLORS, CLASS_LABELS, daysForMode } from '@/lib/scheduleDisplay';
import { getGroupFamilyIds, isTimeWindowOk, rangesOverlap } from '@/lib/scheduleConflicts';
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
import { EntryDialog } from './EntryDialog';
import { GenerateDialog } from './GenerateDialog';
import { cn } from '@/lib/utils';
import type { ScheduleEntry, StudyMode } from '@/types';

export default function CalendarTab() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'DEAN_OFFICE' || role === 'INSTRUCTOR';
  const canGenerate = role === 'ADMIN' || role === 'DEAN_OFFICE';
  const { academicYear, semesterType } = useAcademicYearStore();
  const facultyId = useFacultyFilterStore((s) => s.facultyId);

  const sensors = useScheduleSensors();

  const [studyMode, setStudyMode] = useState<StudyMode>('FULL_TIME');
  const [monday, setMonday] = useState(() => startOfWeek(new Date()));
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState('all');
  const [instructorFilter, setInstructorFilter] = useState('all');

  const days = daysForMode(studyMode);
  const allWeekDates = weekDates(monday);
  // Pokazujemy tylko te dni tygodnia, w ktorych dany tryb studiow w ogole ma zajecia.
  const visibleDates = allWeekDates.filter((date) =>
    days.some((day) => day.key === dayOfWeekOf(date)),
  );

  const from = toDateKey(monday);
  const to = toDateKey(addDays(monday, 6));

  const { data: blocks, isPending: blocksPending } = useQuery({
    queryKey: ['time-blocks'],
    queryFn: fetchTimeBlocks,
  });
  const { data: entries, isPending: entriesPending } = useQuery({
    queryKey: ['schedule-entries', from, to],
    queryFn: () => fetchEntries({ from, to }),
  });
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
  // Wydzialu nie ma wprost na terminie — mapujemy go przez grupe -> kierunek -> wydzial.
  const { data: fields } = useQuery({
    queryKey: ['fields-of-study'],
    queryFn: () => fetchFieldsOfStudy(),
  });

  const rooms = useMemo(
    () =>
      buildings?.flatMap((building) =>
        (building.rooms ?? []).map((room) => ({ ...room, buildingName: building.name })),
      ) ?? [],
    [buildings],
  );

  // grupa.id -> wydzial.id (przez fieldOfStudyId grupy i facultyId kierunku).
  const groupFacultyMap = useMemo(() => {
    const fieldFaculty = new Map((fields ?? []).map((f) => [f.id, f.facultyId]));
    return new Map(
      (groups ?? []).map((g) => [g.id, fieldFaculty.get(g.fieldOfStudyId) ?? null]),
    );
  }, [groups, fields]);

  // Niezalezne filtry Sala/Prowadzacy/Wydzial — ograniczaja TYLKO wyswietlane terminy.
  // Konflikty (podpowiedz przy przeciaganiu) liczymy dalej z pelnych danych tygodnia.
  const visibleEntries = useMemo(
    () =>
      entries?.filter(
        (entry) =>
          (roomFilter === 'all' || entry.room.id === roomFilter) &&
          (instructorFilter === 'all' || entry.instructor.id === instructorFilter) &&
          (facultyId === 'all' ||
            (entry.studentGroup != null &&
              groupFacultyMap.get(entry.studentGroup.id) === facultyId)),
      ) ?? [],
    [entries, roomFilter, instructorFilter, facultyId, groupFacultyMap],
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

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));
  const onDragCancel = () => setActiveId(null);

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
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

        {canGenerate && (
          <Button className="ml-auto" onClick={() => setGenerateOpen(true)}>
            <Sparkles />
            Generuj semestr
          </Button>
        )}
      </div>

      {/* Niezalezne filtry — zawezaja co widac na siatce, nie zmieniaja kontekstu (rok/tryb). */}
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
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        <div className="overflow-x-auto rounded-lg border">
          <div className="flex min-w-max">
            <TimeBlockColumn blocks={blocks} />

            {visibleDates.map((date) => {
              const dateKey = toDateKey(date);
              const holidayName = holidayByDate.get(dateKey);
              const dayEntries = visibleEntries.filter(
                (entry) => toDateKey(entry.date) === dateKey,
              );
              const isToday = dateKey === toDateKey(new Date());
              const label = date.toLocaleDateString('pl-PL', { weekday: 'short' });

              return (
                <div key={dateKey} className="min-w-44 flex-1 border-r last:border-r-0">
                  <ColumnHeader
                    title={`${label} ${formatDayShort(date)}`}
                    subtitle={holidayName}
                    highlighted={isToday}
                  />
                  <div
                    className={cn('relative', holidayName && 'bg-muted/40')}
                    style={{ height: blocks.length * ROW_HEIGHT, minHeight: ROW_HEIGHT }}
                  >
                    {blocks.map((block, rowIndex) => (
                      <DroppableCell
                        key={block.id}
                        id={`${dateKey}::${block.id}`}
                        rowIndex={rowIndex}
                        disabled={!canEdit}
                        availability={
                          cellAvailability
                            ? cellAvailability.get(`${dateKey}::${block.id}`)
                              ? 'available'
                              : 'unavailable'
                            : undefined
                        }
                      />
                    ))}

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
                          )}
                          disabled={!canEdit}
                          onClick={() => setSelectedEntry(entry)}
                        >
                          <div className="font-medium">
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

      {!entriesPending && entries?.length === 0 && (
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
        onOpenChange={(open) => !open && setSelectedEntry(null)}
        canEdit={canEdit}
      />

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        academicYear={academicYear}
        semesterType={semesterType}
        studyMode={studyMode}
      />
    </div>
  );
}
