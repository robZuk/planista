import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
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
import { fetchTimeBlocks } from '@/api/timeBlocks';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import { CLASS_COLORS, CLASS_LABELS, daysForMode } from '@/lib/scheduleDisplay';
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

  const sensors = useScheduleSensors();

  const [studyMode, setStudyMode] = useState<StudyMode>('FULL_TIME');
  const [monday, setMonday] = useState(() => startOfWeek(new Date()));
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

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

  const holidayByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const holiday of holidays ?? []) map.set(toDateKey(holiday.date), holiday.name);
    return map;
  }, [holidays]);

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

  const onDragEnd = (event: DragEndEvent) => {
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
          <Badge variant="secondary">{entries?.length ?? 0} zajec w tym tygodniu</Badge>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="overflow-x-auto rounded-lg border">
          <div className="flex min-w-max">
            <TimeBlockColumn blocks={blocks} />

            {visibleDates.map((date) => {
              const dateKey = toDateKey(date);
              const holidayName = holidayByDate.get(dateKey);
              const dayEntries = entries?.filter((entry) => toDateKey(entry.date) === dateKey) ?? [];
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
