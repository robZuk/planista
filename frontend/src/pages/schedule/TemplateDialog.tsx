import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Combobox } from '@/components/Combobox';
import { createTemplate, deleteTemplate, updateTemplate, type TemplateInput } from '@/api/schedule';
import { fetchBuildings } from '@/api/buildings';
import { fetchInstructors } from '@/api/instructors';
import { fetchTimeBlocks } from '@/api/timeBlocks';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import {
  CLASS_FULL_LABELS,
  CLASS_TYPES,
  ROOM_TYPES_FOR_CLASS,
  WEEK_TYPE_LABELS,
  daysForMode,
  requiredHours,
} from '@/lib/scheduleDisplay';
import type {
  ClassType,
  CurriculumEntry,
  DayOfWeek,
  ScheduleTemplate,
  StudentGroup,
  StudyMode,
  WeekType,
} from '@/types';

const NO_GROUP = '__none__';
const MAX_BLOCKS = 4;

const templateSchema = z.object({
  curriculumEntryId: z.string().min(1, 'Wybierz przedmiot z siatki'),
  classType: z.enum(CLASS_TYPES as [ClassType, ...ClassType[]]),
  instructorId: z.string().min(1, 'Wybierz prowadzacego'),
  roomId: z.string().min(1, 'Wybierz sale'),
  studentGroupId: z.string().optional(),
  dayOfWeek: z.string().min(1, 'Wybierz dzien'),
  startBlockId: z.string().min(1, 'Wybierz godzine rozpoczecia'),
  blockCount: z.number().int().min(1).max(MAX_BLOCKS),
  weekType: z.enum(['EVERY', 'EVEN', 'ODD']),
});

type TemplateValues = z.infer<typeof templateSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYear: string;
  semester: number;
  studyMode: StudyMode;
  curriculumEntries: CurriculumEntry[];
  groups: StudentGroup[];
  /** Wypelnienie z klikniecia w pusta komorke siatki. */
  prefill?: { dayOfWeek: DayOfWeek; startBlockId: string } | null;
  editing?: ScheduleTemplate | null;
}

export function TemplateDialog({
  open,
  onOpenChange,
  academicYear,
  semester,
  studyMode,
  curriculumEntries,
  groups,
  prefill,
  editing,
}: Props) {
  const queryClient = useQueryClient();

  const { data: blocks } = useQuery({ queryKey: ['time-blocks'], queryFn: fetchTimeBlocks });
  const { data: instructors } = useQuery({ queryKey: ['instructors'], queryFn: fetchInstructors });
  const { data: buildings } = useQuery({ queryKey: ['buildings'], queryFn: fetchBuildings });

  const rooms = useMemo(
    () =>
      buildings?.flatMap((building) =>
        (building.rooms ?? []).map((room) => ({ ...room, buildingName: building.name })),
      ) ?? [],
    [buildings],
  );

  const form = useForm<TemplateValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      curriculumEntryId: '',
      classType: 'LECTURE',
      instructorId: '',
      roomId: '',
      studentGroupId: NO_GROUP,
      dayOfWeek: 'MONDAY',
      startBlockId: '',
      blockCount: 1,
      weekType: 'EVERY',
    },
  });

  // Formularz zyje tak dlugo jak dialog, wiec przy kazdym otwarciu ustawiamy go od nowa:
  // albo z edytowanego wzorca, albo z komorki, w ktora kliknieto.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        curriculumEntryId: editing.curriculumEntryId,
        classType: editing.classType,
        instructorId: editing.instructor.id,
        roomId: editing.room.id,
        studentGroupId: editing.studentGroup?.id ?? NO_GROUP,
        dayOfWeek: editing.dayOfWeek,
        startBlockId: editing.startBlock.id,
        blockCount: editing.endBlock.order - editing.startBlock.order + 1,
        weekType: editing.weekType,
      });
    } else {
      form.reset({
        curriculumEntryId: '',
        classType: 'LECTURE',
        instructorId: '',
        roomId: '',
        studentGroupId: NO_GROUP,
        dayOfWeek: prefill?.dayOfWeek ?? daysForMode(studyMode)[0]!.key,
        startBlockId: prefill?.startBlockId ?? '',
        blockCount: 1,
        weekType: 'EVERY',
      });
    }
  }, [open, editing, prefill, studyMode, form]);

  const selectedEntryId = form.watch('curriculumEntryId');
  const selectedClassType = form.watch('classType');
  const selectedEntry = curriculumEntries.find((entry) => entry.id === selectedEntryId);

  // Typy zajec ograniczamy do tych, ktore siatka faktycznie przewiduje dla przedmiotu —
  // planowanie laboratorium dla przedmiotu bez godzin lab i tak skonczyloby sie bledem.
  const availableClassTypes = selectedEntry
    ? CLASS_TYPES.filter((type) => requiredHours(selectedEntry, type) > 0)
    : CLASS_TYPES;

  // Sale zawezone do typow pasujacych do zajec (lustro reguly z backendu).
  const allowedRoomTypes = ROOM_TYPES_FOR_CLASS[selectedClassType];
  const availableRooms = rooms.filter((room) => allowedRoomTypes.includes(room.type));

  const saveMutation = useMutation({
    mutationFn: (values: TemplateValues) => {
      const startBlock = blocks?.find((block) => block.id === values.startBlockId);
      const endBlock = blocks?.find(
        (block) => block.order === (startBlock?.order ?? 0) + values.blockCount - 1,
      );
      if (!startBlock || !endBlock) throw new Error('Nieprawidlowy zakres blokow');

      const input: TemplateInput = {
        curriculumEntryId: values.curriculumEntryId,
        classType: values.classType,
        roomId: values.roomId,
        instructorId: values.instructorId,
        studentGroupId: values.studentGroupId === NO_GROUP ? null : values.studentGroupId,
        dayOfWeek: values.dayOfWeek as DayOfWeek,
        startBlockId: startBlock.id,
        endBlockId: endBlock.id,
        semester,
        academicYear,
        weekType: values.weekType as WeekType,
        studyMode,
      };
      return editing ? updateTemplate(editing.id, input) : createTemplate(input);
    },
    onSuccess: () => {
      toast.success(editing ? 'Wzorzec zaktualizowany' : 'Wzorzec dodany');
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      void queryClient.invalidateQueries({ queryKey: ['coverage'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getScheduleErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTemplate(editing!.id),
    onSuccess: () => {
      toast.success('Wzorzec usuniety wraz z wygenerowanymi terminami');
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      void queryClient.invalidateQueries({ queryKey: ['coverage'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getScheduleErrorMessage(error)),
  });

  const days = daysForMode(studyMode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edytuj zajecia' : 'Nowe zajecia we wzorcu'}</DialogTitle>
          <DialogDescription>
            Wzorzec opisuje jeden powtarzalny termin w tygodniu. Konkretne daty powstaja dopiero
            przy generowaniu semestru.
          </DialogDescription>
        </DialogHeader>

        <form
          id="template-form"
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          noValidate
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="curriculumEntryId">Przedmiot z siatki</FieldLabel>
              <Controller
                control={form.control}
                name="curriculumEntryId"
                render={({ field }) => (
                  <Combobox
                    id="curriculumEntryId"
                    options={curriculumEntries.map((entry) => ({
                      value: entry.id,
                      label: entry.subject.name,
                      keywords: entry.subject.code ?? '',
                    }))}
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      // Prowadzacy z siatki to sensowna wartosc startowa — mozna ja nadpisac.
                      const entry = curriculumEntries.find((item) => item.id === value);
                      if (entry?.instructor) form.setValue('instructorId', entry.instructor.id);
                      const firstType = CLASS_TYPES.find((type) => requiredHours(entry!, type) > 0);
                      if (firstType) form.setValue('classType', firstType);
                    }}
                    placeholder="Wybierz przedmiot"
                    searchPlaceholder="Szukaj po nazwie lub kodzie…"
                    emptyText="Ten semestr siatki jest pusty."
                    invalid={!!form.formState.errors.curriculumEntryId}
                  />
                )}
              />
              <FieldError errors={[form.formState.errors.curriculumEntryId]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="classType">Forma zajec</FieldLabel>
                <Controller
                  control={form.control}
                  name="classType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="classType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableClassTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {CLASS_FULL_LABELS[type]}
                            {selectedEntry && ` — ${requiredHours(selectedEntry, type)} h`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {selectedEntry && (
                  <FieldDescription>
                    Siatka przewiduje {requiredHours(selectedEntry, selectedClassType)} h tej formy.
                  </FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="studentGroupId">Grupa</FieldLabel>
                <Controller
                  control={form.control}
                  name="studentGroupId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="studentGroupId">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_GROUP}>Caly rocznik (bez grupy)</SelectItem>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name} ({group.size} os.)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="instructorId">Prowadzacy</FieldLabel>
                <Controller
                  control={form.control}
                  name="instructorId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="instructorId"
                        aria-invalid={!!form.formState.errors.instructorId}
                      >
                        <SelectValue placeholder="Wybierz" />
                      </SelectTrigger>
                      <SelectContent>
                        {instructors?.map((instructor) => (
                          <SelectItem key={instructor.id} value={instructor.id}>
                            {`${instructor.title ?? ''} ${instructor.firstName} ${instructor.lastName}`.trim()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.instructorId]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="roomId">Sala</FieldLabel>
                <Controller
                  control={form.control}
                  name="roomId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="roomId" aria-invalid={!!form.formState.errors.roomId}>
                        <SelectValue placeholder="Wybierz" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRooms.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.buildingName} · {room.number} ({room.capacity} os.)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>
                  Lista zawezona do sal pasujacych do wybranej formy zajec.
                </FieldDescription>
                <FieldError errors={[form.formState.errors.roomId]} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="dayOfWeek">Dzien</FieldLabel>
                <Controller
                  control={form.control}
                  name="dayOfWeek"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="dayOfWeek">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {days.map((day) => (
                          <SelectItem key={day.key} value={day.key}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="startBlockId">Od godziny</FieldLabel>
                <Controller
                  control={form.control}
                  name="startBlockId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="startBlockId"
                        aria-invalid={!!form.formState.errors.startBlockId}
                      >
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {blocks?.map((block) => (
                          <SelectItem key={block.id} value={block.id}>
                            {block.startTime}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.startBlockId]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="blockCount">Godzin</FieldLabel>
                <Controller
                  control={form.control}
                  name="blockCount"
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <SelectTrigger id="blockCount">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: MAX_BLOCKS }, (_, i) => i + 1).map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {count}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="weekType">Powtarzalnosc</FieldLabel>
                <Controller
                  control={form.control}
                  name="weekType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="weekType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(WEEK_TYPE_LABELS) as WeekType[]).map((type) => (
                          <SelectItem key={type} value={type}>
                            {WEEK_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
          </FieldGroup>
        </form>

        <DialogFooter className="sm:justify-between">
          {editing ? (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Spinner /> : <Trash2 />}
              Usun wzorzec
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="template-form" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Spinner />}
              {editing ? 'Zapisz zmiany' : 'Dodaj'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
