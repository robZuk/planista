import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/data-table/DataTable';
import { SortableHeader } from '@/components/data-table/SortableHeader';
import { createCalendar, deleteCalendar, fetchCalendars, updateCalendar } from '@/api/schedule';
import { fetchAcademicYears } from '@/api/curriculum';
import { fetchFaculties } from '@/api/faculties';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLong, toDateKey } from '@/lib/scheduleDates';
import { SEMESTER_TYPE_LABELS } from '@/lib/semester';
import { STUDY_MODE_LABELS, STUDY_MODES } from '@/lib/labels';
import { useAuthStore } from '@/store/authStore';
import type { SemesterCalendar, SemesterType, StudyMode } from '@/types';

const ALL_FACULTIES = '__all__';

const calendarSchema = z
  .object({
    academicYear: z.string().min(1, 'Wybierz rok akademicki'),
    semesterType: z.enum(['WINTER', 'SUMMER']),
    studyMode: z.enum(['FULL_TIME', 'PART_TIME']),
    facultyId: z.string(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Wybierz date poczatku'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Wybierz date konca'),
  })
  .refine((values) => values.startDate < values.endDate, {
    path: ['endDate'],
    message: 'Koniec musi byc pozniej niz poczatek',
  });

type CalendarValues = z.infer<typeof calendarSchema>;

const COLUMN_LABELS = {
  academicYear: 'Rok',
  semesterType: 'Semestr',
  studyMode: 'Tryb',
  faculty: 'Wydzial',
  range: 'Zakres',
  teachingWeeks: 'Tygodni',
};

/**
 * Kalendarz semestru wyznacza zakres dat, na ktory generator rozpisuje wzorce.
 * Kalendarz wydzialowy ma pierwszenstwo nad ogolnouczelnianym — dzieki temu wydzial
 * moze miec wlasne terminy, nie dublujac calej konfiguracji.
 */
export default function SemesterCalendarsPage() {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'ADMIN';
  const canEdit = isAdmin || me?.role === 'DEAN_OFFICE';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SemesterCalendar | null>(null);
  const [deleting, setDeleting] = useState<SemesterCalendar | null>(null);

  const { data, isPending } = useQuery({ queryKey: ['semester-calendars'], queryFn: fetchCalendars });
  const { data: years } = useQuery({ queryKey: ['academic-years'], queryFn: fetchAcademicYears });
  const { data: faculties } = useQuery({ queryKey: ['faculties'], queryFn: fetchFaculties });

  const form = useForm<CalendarValues>({
    resolver: zodResolver(calendarSchema),
    defaultValues: {
      academicYear: '',
      semesterType: 'WINTER',
      studyMode: 'FULL_TIME',
      facultyId: ALL_FACULTIES,
      startDate: '',
      endDate: '',
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['semester-calendars'] });

  const saveMutation = useMutation({
    mutationFn: (values: CalendarValues) =>
      // Klucz kalendarza (rok, semestr, tryb, wydzial) jest niezmienny — edycja
      // dotyczy wylacznie dat, tak jak na backendzie.
      editing
        ? updateCalendar(editing.id, { startDate: values.startDate, endDate: values.endDate })
        : createCalendar({
            academicYear: values.academicYear,
            semesterType: values.semesterType as SemesterType,
            studyMode: values.studyMode as StudyMode,
            facultyId: values.facultyId === ALL_FACULTIES ? null : values.facultyId,
            startDate: values.startDate,
            endDate: values.endDate,
          }),
    onSuccess: () => {
      toast.success(editing ? 'Kalendarz zaktualizowany' : 'Kalendarz semestru utworzony');
      setDialogOpen(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCalendar(id),
    onSuccess: () => {
      toast.success('Kalendarz usuniety');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      academicYear: years?.[0] ?? '',
      semesterType: 'WINTER',
      studyMode: 'FULL_TIME',
      // Dziekanat zaklada wylacznie kalendarz swojego wydzialu.
      facultyId: isAdmin ? ALL_FACULTIES : (me?.facultyId ?? ALL_FACULTIES),
      startDate: '',
      endDate: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (calendar: SemesterCalendar) => {
    setEditing(calendar);
    form.reset({
      academicYear: calendar.academicYear,
      semesterType: calendar.semesterType,
      studyMode: calendar.studyMode,
      facultyId: calendar.facultyId ?? ALL_FACULTIES,
      startDate: toDateKey(calendar.startDate),
      endDate: toDateKey(calendar.endDate),
    });
    setDialogOpen(true);
  };

  // Dziekanat widzi kalendarze ogolnouczelniane (jako swoj fallback), ale ich nie edytuje.
  const canEditRow = (calendar: SemesterCalendar) =>
    canEdit && (isAdmin || calendar.facultyId === me?.facultyId);

  const columns: ColumnDef<SemesterCalendar, unknown>[] = [
    {
      accessorKey: 'academicYear',
      header: ({ column }) => <SortableHeader column={column}>Rok</SortableHeader>,
      enableHiding: false,
      cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.academicYear}</span>,
    },
    {
      accessorKey: 'semesterType',
      header: 'Semestr',
      cell: ({ row }) => <span>{SEMESTER_TYPE_LABELS[row.original.semesterType]}</span>,
    },
    {
      accessorKey: 'studyMode',
      header: 'Tryb',
      cell: ({ row }) => (
        <Badge variant="secondary">{STUDY_MODE_LABELS[row.original.studyMode]}</Badge>
      ),
    },
    {
      id: 'faculty',
      accessorFn: (row) => row.faculty?.shortName ?? '',
      header: ({ column }) => <SortableHeader column={column}>Wydzial</SortableHeader>,
      cell: ({ row }) =>
        row.original.faculty ? (
          <Badge variant="outline">{row.original.faculty.shortName}</Badge>
        ) : (
          <span className="text-muted-foreground">ogolnouczelniany</span>
        ),
    },
    {
      id: 'range',
      accessorFn: (row) => row.startDate,
      header: ({ column }) => <SortableHeader column={column}>Zakres</SortableHeader>,
      cell: ({ row }) => (
        <span className="text-sm">
          {formatDateLong(row.original.startDate)} – {formatDateLong(row.original.endDate)}
        </span>
      ),
    },
    {
      accessorKey: 'teachingWeeks',
      header: 'Tygodni',
      cell: ({ row }) => <span className="tabular-nums">{row.original.teachingWeeks}</span>,
    },
    ...(canEdit
      ? [
          {
            id: 'actions',
            enableHiding: false,
            size: 100,
            cell: ({ row }) =>
              canEditRow(row.original) ? (
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Edytuj zakres dat"
                    onClick={() => openEdit(row.original)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    aria-label="Usun kalendarz"
                    onClick={() => setDeleting(row.original)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ) : null,
          } satisfies ColumnDef<SemesterCalendar, unknown>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Kalendarz semestru"
        description="Zakres dat, na ktory generator rozpisuje wzorce tygodnia."
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus />
              Dodaj kalendarz
            </Button>
          )
        }
      />

      <Alert>
        <CalendarRange />
        <AlertTitle>Wydzial ma pierwszenstwo</AlertTitle>
        <AlertDescription>
          Jesli wydzial ma wlasny kalendarz dla danego roku, semestru i trybu, generator uzyje
          jego dat. W przeciwnym razie siegnie po kalendarz ogolnouczelniany, a gdy i tego nie
          ma — po daty wyliczone z roku akademickiego.
        </AlertDescription>
      </Alert>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        searchPlaceholder="Szukaj kalendarza…"
        columnLabels={COLUMN_LABELS}
        pageSize={15}
        emptyState={
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarRange />
              </EmptyMedia>
              <EmptyTitle>Brak kalendarzy semestru</EmptyTitle>
              <EmptyDescription>
                Bez nich generator uzyje domyslnych dat wyliczonych z roku akademickiego.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edytuj zakres dat' : 'Nowy kalendarz semestru'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Rok, semestr, tryb i wydzial sa niezmienne — zmienic mozna tylko daty.'
                : 'Liczba tygodni dydaktycznych wyliczy sie sama z zakresu dat.'}
            </DialogDescription>
          </DialogHeader>

          <form
            id="calendar-form"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
              {!editing && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel htmlFor="academicYear">Rok akademicki</FieldLabel>
                      <Controller
                        control={form.control}
                        name="academicYear"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger id="academicYear">
                              <SelectValue placeholder="Wybierz rok…" />
                            </SelectTrigger>
                            <SelectContent>
                              {years?.map((year) => (
                                <SelectItem key={year} value={year}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FieldError errors={[form.formState.errors.academicYear]} />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="semesterType">Semestr</FieldLabel>
                      <Controller
                        control={form.control}
                        name="semesterType"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger id="semesterType">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(SEMESTER_TYPE_LABELS) as SemesterType[]).map((type) => (
                                <SelectItem key={type} value={type}>
                                  {SEMESTER_TYPE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel htmlFor="studyMode">Tryb studiow</FieldLabel>
                      <Controller
                        control={form.control}
                        name="studyMode"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger id="studyMode">
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
                        )}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="facultyId">Wydzial</FieldLabel>
                      <Controller
                        control={form.control}
                        name="facultyId"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={!isAdmin}
                          >
                            <SelectTrigger id="facultyId">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {isAdmin && (
                                <SelectItem value={ALL_FACULTIES}>Ogolnouczelniany</SelectItem>
                              )}
                              {faculties?.map((faculty) => (
                                <SelectItem key={faculty.id} value={faculty.id}>
                                  {faculty.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FieldDescription>
                        {isAdmin
                          ? 'Ogolnouczelniany obowiazuje wydzialy bez wlasnego kalendarza.'
                          : 'Kalendarz zakladasz dla swojego wydzialu.'}
                      </FieldDescription>
                    </Field>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="startDate">Poczatek</FieldLabel>
                  <Input
                    id="startDate"
                    type="date"
                    aria-invalid={!!form.formState.errors.startDate}
                    {...form.register('startDate')}
                  />
                  <FieldError errors={[form.formState.errors.startDate]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="endDate">Koniec</FieldLabel>
                  <Input
                    id="endDate"
                    type="date"
                    aria-invalid={!!form.formState.errors.endDate}
                    {...form.register('endDate')}
                  />
                  <FieldError errors={[form.formState.errors.endDate]} />
                </Field>
              </div>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="calendar-form" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Spinner />}
              {editing ? 'Zapisz' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Usunac kalendarz semestru?"
        description={
          deleting
            ? `${SEMESTER_TYPE_LABELS[deleting.semesterType]} ${deleting.academicYear} (${
                deleting.faculty?.shortName ?? 'ogolnouczelniany'
              }). Generowanie siegnie wtedy po kalendarz ogolnouczelniany albo daty domyslne.`
            : ''
        }
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  );
}
