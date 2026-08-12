import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Combobox } from '@/components/Combobox';
import { createEntry, type CreateEntryInput } from '@/api/schedule';
import { fetchBuildings } from '@/api/buildings';
import { fetchInstructors } from '@/api/instructors';
import { fetchTimeBlocks } from '@/api/timeBlocks';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import {
  CLASS_FULL_LABELS,
  CLASS_TYPES,
  ROOM_TYPES_FOR_CLASS,
  STATUS_LABELS,
  requiredHours,
} from '@/lib/scheduleDisplay';
import type { ClassType, CurriculumEntry, EntryStatus, StudentGroup, StudyMode } from '@/types';

const MAX_BLOCKS = 4;

const entrySchema = z.object({
  curriculumEntryId: z.string().min(1, 'Wybierz przedmiot z siatki'),
  classType: z.enum(CLASS_TYPES as [ClassType, ...ClassType[]]),
  instructorId: z.string().min(1, 'Wybierz prowadzacego'),
  roomId: z.string().min(1, 'Wybierz sale'),
  studentGroupId: z.string().min(1, 'Wybierz grupe'),
  blockCount: z.number().int().min(1).max(MAX_BLOCKS),
  status: z.enum(['SCHEDULED', 'CANCELLED', 'MAKEUP']),
  // Lista terminow: pierwszy jest wymagany, kolejne to opcjonalne dodatkowe daty.
  slots: z
    .array(
      z.object({
        date: z.string().min(1, 'Wybierz date'),
        startBlockId: z.string().min(1, 'Wybierz godzine'),
      }),
    )
    .min(1, 'Dodaj przynajmniej jeden termin'),
});

type EntryValues = z.infer<typeof entrySchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studyMode: StudyMode;
  curriculumEntries: CurriculumEntry[];
  groups: StudentGroup[];
  /** Wypelnienie z klikniecia w pusta komorke kalendarza (albo domyslna data widoku). */
  prefill?: { date: string; startBlockId?: string } | null;
}

/**
 * Reczne dodanie terminow wprost do kalendarza (bez wzorca, templateId=null). Mozna dodac jedna
 * date albo kilka naraz — kazda pozycja z listy tworzy osobny termin o tych samych parametrach.
 * Przydatne np. do wpisania odrobienia zajec albo pojedynczych zajec spoza serii.
 */
export function EntryCreateDialog({
  open,
  onOpenChange,
  studyMode,
  curriculumEntries,
  groups,
  prefill,
}: Props) {
  const queryClient = useQueryClient();

  const { data: blocks } = useQuery({ queryKey: ['time-blocks'], queryFn: fetchTimeBlocks });
  const { data: instructors } = useQuery({ queryKey: ['instructors'], queryFn: fetchInstructors });
  const { data: buildings } = useQuery({ queryKey: ['buildings'], queryFn: fetchBuildings });

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

  const form = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      curriculumEntryId: '',
      classType: 'LECTURE',
      instructorId: '',
      roomId: '',
      studentGroupId: '',
      blockCount: 1,
      status: 'SCHEDULED',
      slots: [{ date: '', startBlockId: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'slots' });

  // Formularz zyje tak dlugo jak dialog — przy kazdym otwarciu ustawiamy go od nowa.
  useEffect(() => {
    if (!open) return;
    form.reset({
      curriculumEntryId: '',
      classType: 'LECTURE',
      instructorId: '',
      roomId: '',
      studentGroupId: '',
      blockCount: 1,
      status: 'SCHEDULED',
      slots: [{ date: prefill?.date ?? '', startBlockId: prefill?.startBlockId ?? '' }],
    });
  }, [open, prefill, form]);

  const selectedEntryId = form.watch('curriculumEntryId');
  const selectedClassType = form.watch('classType');
  const selectedEntry = curriculumEntries.find((entry) => entry.id === selectedEntryId);

  // Typy zajec ograniczamy do tych, ktore siatka faktycznie przewiduje dla przedmiotu.
  const availableClassTypes = selectedEntry
    ? CLASS_TYPES.filter((type) => requiredHours(selectedEntry, type) > 0)
    : CLASS_TYPES;

  // Sale zawezone do typow pasujacych do zajec (lustro reguly z backendu).
  const allowedRoomTypes = ROOM_TYPES_FOR_CLASS[selectedClassType];
  const availableRooms = rooms.filter((room) => allowedRoomTypes.includes(room.type));

  // Sale pogrupowane po wydziale (przez budynek); sale bez wydzialu -> sekcja na koncu.
  const roomsByFaculty = useMemo(() => {
    const map = new Map<string, { facultyName: string; items: typeof availableRooms }>();
    for (const room of availableRooms) {
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
  }, [availableRooms]);

  // Prowadzacy pogrupowani po wydziale; bez wydzialu -> sekcja na koncu.
  const instructorsByFaculty = useMemo(() => {
    type Ins = NonNullable<typeof instructors>[number];
    const map = new Map<string, { facultyName: string; items: Ins[] }>();
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

  const saveMutation = useMutation({
    mutationFn: async (values: EntryValues) => {
      // Kazda pozycja listy to osobny termin — tworzymy je niezaleznie, zeby konflikt na jednej
      // dacie nie przekreslal pozostalych. Zbieramy wynik i raportujemy zbiorczo.
      const results = await Promise.allSettled(
        values.slots.map((slot) => {
          const startBlock = blocks?.find((block) => block.id === slot.startBlockId);
          const endBlock = blocks?.find(
            (block) => block.order === (startBlock?.order ?? 0) + values.blockCount - 1,
          );
          if (!startBlock || !endBlock) {
            return Promise.reject(new Error('Zajecia nie zmieszcza sie do konca dnia'));
          }
          const input: CreateEntryInput = {
            date: slot.date,
            classType: values.classType,
            roomId: values.roomId,
            instructorId: values.instructorId,
            studentGroupId: values.studentGroupId,
            curriculumEntryId: values.curriculumEntryId,
            startBlockId: startBlock.id,
            endBlockId: endBlock.id,
            status: values.status,
          };
          return createEntry(input);
        }),
      );
      const created = results.filter((r) => r.status === 'fulfilled').length;
      const firstError = results.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      return { created, failed: results.length - created, firstError };
    },
    onSuccess: ({ created, failed, firstError }) => {
      if (created > 0) {
        void queryClient.invalidateQueries({ queryKey: ['schedule-entries'] });
        void queryClient.invalidateQueries({ queryKey: ['coverage'] });
      }
      if (failed === 0) {
        toast.success(created === 1 ? 'Termin dodany' : `Dodano ${created} terminow`);
        onOpenChange(false);
      } else if (created > 0) {
        // Czesc dat sie nie udala (np. konflikt) — zostawiamy okno otwarte, by poprawic reszte.
        toast.warning(`Dodano ${created}, nie powstalo ${failed} (np. konflikt terminu)`);
      } else {
        toast.error(getScheduleErrorMessage(firstError?.reason));
      }
    },
    onError: (error) => toast.error(getScheduleErrorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dodaj termin recznie</DialogTitle>
          <DialogDescription>
            Wpis prosto w kalendarz — bez wzorca tygodnia. Dodaj jedna date albo kilka naraz. Uwaga:
            termin bez wzorca nie przetrwa ponownego generowania semestru ani czyszczenia kalendarza —
            nadpisanie kasuje wszystkie terminy wydzialu w tym zakresie dat.
          </DialogDescription>
        </DialogHeader>

        {studyMode === 'PART_TIME' && (
          <Alert>
            <Info />
            <AlertTitle>Studia niestacjonarne</AlertTitle>
            <AlertDescription>
              Termin przyjmowany tylko w piatek od 15:00 oraz w sobote i niedziele — poza tym oknem
              backend go odrzuci.
            </AlertDescription>
          </Alert>
        )}

        <form
          id="entry-form"
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
              </Field>

              <Field>
                <FieldLabel htmlFor="studentGroupId">Grupa</FieldLabel>
                <Controller
                  control={form.control}
                  name="studentGroupId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="studentGroupId"
                        aria-invalid={!!form.formState.errors.studentGroupId}
                      >
                        <SelectValue placeholder="Wybierz grupe" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name} ({group.size} os.)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.studentGroupId]} />
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
                        {instructorsByFaculty.map((group) => (
                          <SelectGroup key={group.facultyName}>
                            <SelectLabel>{group.facultyName}</SelectLabel>
                            {group.items.map((instructor) => (
                              <SelectItem key={instructor.id} value={instructor.id}>
                                {`${instructor.title ?? ''} ${instructor.firstName} ${instructor.lastName}`.trim()}
                              </SelectItem>
                            ))}
                          </SelectGroup>
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
                        {roomsByFaculty.map((group) => (
                          <SelectGroup key={group.facultyName}>
                            <SelectLabel>{group.facultyName}</SelectLabel>
                            {group.items.map((room) => (
                              <SelectItem key={room.id} value={room.id}>
                                {room.buildingName} · {room.number} ({room.capacity} os.)
                              </SelectItem>
                            ))}
                          </SelectGroup>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="blockCount">Czas trwania (godzin)</FieldLabel>
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
                <FieldLabel htmlFor="status">Status</FieldLabel>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABELS) as EntryStatus[]).map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            {/* Lista terminow: kazda pozycja = osobna data (i godzina). Wspolne dane sa wyzej. */}
            <Field>
              <FieldLabel>Terminy</FieldLabel>
              <div className="space-y-2">
                {fields.map((row, index) => (
                  <div key={row.id} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Controller
                        control={form.control}
                        name={`slots.${index}.date`}
                        render={({ field }) => (
                          <input
                            type="date"
                            value={field.value}
                            onChange={field.onChange}
                            aria-label={`Data terminu ${index + 1}`}
                            aria-invalid={!!form.formState.errors.slots?.[index]?.date}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
                          />
                        )}
                      />
                    </div>
                    <div className="w-32">
                      <Controller
                        control={form.control}
                        name={`slots.${index}.startBlockId`}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger
                              aria-label={`Godzina terminu ${index + 1}`}
                              aria-invalid={!!form.formState.errors.slots?.[index]?.startBlockId}
                            >
                              <SelectValue placeholder="Godzina" />
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
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Usun termin ${index + 1}`}
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  append({
                    date: '',
                    // Nowa pozycja przejmuje godzine z pierwszego terminu — zwykle to samo okno.
                    startBlockId: form.getValues('slots.0.startBlockId') ?? '',
                  })
                }
              >
                <Plus />
                Dodaj kolejny termin
              </Button>
              <FieldError errors={[form.formState.errors.slots]} />
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button type="submit" form="entry-form" disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Spinner />}
            {fields.length > 1 ? `Dodaj ${fields.length} terminy` : 'Dodaj termin'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
