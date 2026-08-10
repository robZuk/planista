import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarRange, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
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
import {
  createCalendar,
  deleteCalendar,
  fetchCalendars,
  fetchEntries,
  updateCalendar,
} from '@/api/schedule';
import { fetchAcademicYears } from '@/api/curriculum';
import { fetchFaculties } from '@/api/faculties';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLong, toDateKey } from '@/lib/scheduleDates';
import { SEMESTER_TYPE_LABELS } from '@/lib/semester';
import { STUDY_MODE_LABELS, STUDY_MODES } from '@/lib/labels';
import { useAuthStore } from '@/store/authStore';
import type { SemesterCalendar, SemesterType, StudyMode } from '@/types';

/** Wartosc pola "Wydzial" oznaczajaca zalozenie kalendarza po wierszu na kazdy wydzial. */
const ALL_FACULTIES = '__all__';

const calendarSchema = z
  .object({
    academicYear: z.string().min(1, 'Wybierz rok akademicki'),
    semesterType: z.enum(['WINTER', 'SUMMER']),
    studyMode: z.enum(['FULL_TIME', 'PART_TIME']),
    facultyId: z.string().min(1, 'Wybierz wydzial'),
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
  usage: 'Plan',
};

/**
 * Kalendarz semestru wyznacza zakres dat, na ktory generator rozpisuje wzorce.
 * Kazdy kalendarz nalezy do wydzialu — wspolne daty dla calej uczelni zaklada sie
 * jednym gestem ("wszystkie wydzialy"), ale zapisuja sie jako osobne, jawne wiersze.
 * Wydzial bez kalendarza dostaje daty wyliczone z roku akademickiego (i traci
 * przelicznik godzin tygodniowych), dlatego braki wypisujemy nad tabela.
 */
export default function SemesterCalendarsPage() {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'ADMIN';
  const canEdit = isAdmin || me?.role === 'DEAN_OFFICE';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SemesterCalendar | null>(null);
  const [deleting, setDeleting] = useState<SemesterCalendar | null>(null);

  // Filtry listy — zawezaja tylko to, co widac w tabeli. 'all' = bez zawezania.
  const [yearFilter, setYearFilter] = useState('all');
  const [semesterFilter, setSemesterFilter] = useState<SemesterType | 'all'>('all');
  const [modeFilter, setModeFilter] = useState<StudyMode | 'all'>('all');
  const [facultyFilter, setFacultyFilter] = useState('all');

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

  const newStart = form.watch('startDate');
  const newEnd = form.watch('endDate');
  // Wydluzenie semestru niczego nie ucina, wiec pytamy o terminy dopiero przy skracaniu —
  // inaczej samo otwarcie edycji ciagnelo caly semestr zajec bez powodu.
  const isShrinking =
    !!editing &&
    !!newStart &&
    !!newEnd &&
    (newStart > toDateKey(editing.startDate) || newEnd < toDateKey(editing.endDate));

  // Podglad skrocenia semestru. Backend odrzuca zmiane, gdy poza nowym zakresem zostana
  // zajecia (409) — tu liczymy to samo na zywo, zeby nie dowiadywac sie o tym dopiero
  // z bledu po kliknieciu "Zapisz". Zakres pytania to STARY zakres kalendarza.
  const { data: rangeEntries } = useQuery({
    queryKey: ['schedule-entries', 'calendar-edit', editing?.id],
    queryFn: () =>
      fetchEntries({
        from: toDateKey(editing!.startDate),
        to: toDateKey(editing!.endDate),
        ...(editing!.facultyId ? { facultyId: editing!.facultyId } : {}),
      }),
    enabled: dialogOpen && !!editing && editing.entryCount > 0 && isShrinking,
  });
  const cutEntries = useMemo(() => {
    if (!editing || !rangeEntries) return 0;
    return rangeEntries.filter((entry) => {
      // Lustro guardu z backendu: odwolane zajecia go nie blokuja, a kalendarz
      // ogolnouczelniany patrzy na wszystkie wydzialy — stad brak filtra wydzialu wyzej.
      if (entry.status === 'CANCELLED') return false;
      if (entry.curriculumEntry.curriculumVersion.studyMode !== editing.studyMode) return false;
      const date = toDateKey(entry.date);
      return date < newStart || date > newEnd;
    }).length;
  }, [editing, rangeEntries, newStart, newEnd]);

  /**
   * Braki w pokryciu. Po usunieciu kalendarza ogolnouczelnianego nie ma juz siatki
   * bezpieczenstwa: wydzial bez wlasnego wpisu dostaje daty wyliczone z roku, bez
   * `teachingWeeks`. Sprawdzamy tylko te kombinacje [rok, semestr, tryb], ktore juz
   * gdziekolwiek istnieja — brak calego rocznika to nie luka, tylko rok nieustawiony.
   *
   * Dziekanat widzi wylacznie swoj wydzial, wiec nie ma z czym porownywac — dla niego
   * ten podglad nie ma sensu i go nie liczymy.
   */
  const gaps = useMemo(() => {
    if (!isAdmin || !data || !faculties?.length) return [];
    const byScope = new Map<string, Set<string>>();
    for (const calendar of data) {
      const key = `${calendar.academicYear}|${calendar.semesterType}|${calendar.studyMode}`;
      const set = byScope.get(key) ?? new Set<string>();
      set.add(calendar.facultyId);
      byScope.set(key, set);
    }
    return [...byScope.entries()]
      .map(([key, covered]) => {
        const [academicYear, semesterType, studyMode] = key.split('|');
        return {
          label: `${academicYear} ${SEMESTER_TYPE_LABELS[semesterType as SemesterType].toLowerCase()}, ${STUDY_MODE_LABELS[studyMode as StudyMode].toLowerCase()}`,
          faculties: faculties.filter((f) => !covered.has(f.id)).map((f) => f.shortName),
        };
      })
      .filter((gap) => gap.faculties.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [isAdmin, data, faculties]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['semester-calendars'] });

  const saveMutation = useMutation({
    // Zwracamy gotowy komunikat, bo przy zakladaniu hurtowym liczy sie to, co odeslal
    // serwer ("dla N wydzialow, M pominieto"), a nie stale "utworzono".
    mutationFn: async (values: CalendarValues): Promise<string> => {
      // Klucz kalendarza (rok, semestr, tryb, wydzial) jest niezmienny — edycja
      // dotyczy wylacznie dat, tak jak na backendzie.
      if (editing) {
        await updateCalendar(editing.id, {
          startDate: values.startDate,
          endDate: values.endDate,
        });
        return 'Kalendarz zaktualizowany';
      }
      const result = await createCalendar({
        academicYear: values.academicYear,
        semesterType: values.semesterType as SemesterType,
        studyMode: values.studyMode as StudyMode,
        ...(values.facultyId === ALL_FACULTIES
          ? { allFaculties: true }
          : { facultyId: values.facultyId }),
        startDate: values.startDate,
        endDate: values.endDate,
      });
      return result.message;
    },
    onSuccess: (message) => {
      toast.success(message);
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
      // Admin domyslnie zaklada dla calej uczelni, dziekanat wylacznie dla siebie.
      facultyId: isAdmin ? ALL_FACULTIES : (me?.facultyId ?? ''),
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
      facultyId: calendar.facultyId,
      startDate: toDateKey(calendar.startDate),
      endDate: toDateKey(calendar.endDate),
    });
    setDialogOpen(true);
  };

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
      accessorFn: (row) => row.faculty.shortName,
      header: ({ column }) => <SortableHeader column={column}>Wydzial</SortableHeader>,
      cell: ({ row }) => <Badge variant="outline">{row.original.faculty.shortName}</Badge>,
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
    {
      id: 'usage',
      accessorFn: (row) => row.entryCount,
      header: ({ column }) => <SortableHeader column={column}>Plan</SortableHeader>,
      cell: ({ row }) => {
        const { templateCount, entryCount } = row.original;
        if (templateCount === 0 && entryCount === 0) {
          return <span className="text-sm text-muted-foreground">nieuzywany</span>;
        }
        return (
          <span className="text-sm tabular-nums">
            {templateCount} wzorcow
            <span className="text-muted-foreground"> · </span>
            {entryCount} terminow
          </span>
        );
      },
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

  const filteredData = useMemo(
    () =>
      (data ?? []).filter(
        (calendar) =>
          (yearFilter === 'all' || calendar.academicYear === yearFilter) &&
          (semesterFilter === 'all' || calendar.semesterType === semesterFilter) &&
          (modeFilter === 'all' || calendar.studyMode === modeFilter) &&
          (facultyFilter === 'all' || calendar.facultyId === facultyFilter),
      ),
    [data, yearFilter, semesterFilter, modeFilter, facultyFilter],
  );

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

      {gaps.length > 0 ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Wydzialy bez kalendarza</AlertTitle>
          <AlertDescription>
            <div className="space-y-1">
              <p>
                Generator uzyje dla nich dat wyliczonych z roku akademickiego, a wzorzec tygodnia
                straci przelicznik godzin semestralnych na tygodniowe.
              </p>
              <ul className="text-sm">
                {gaps.map((gap) => (
                  <li key={gap.label}>
                    <span className="font-medium">{gap.label}</span> — {gap.faculties.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <CalendarRange />
          <AlertTitle>Kazdy wydzial ma wlasne daty</AlertTitle>
          <AlertDescription>
            Kalendarz zawsze nalezy do wydzialu. Wspolne terminy dla calej uczelni zakladasz
            jednym gestem — wybierz „wszystkie wydzialy", a powstanie osobny wiersz dla kazdego.
            Wydzial bez kalendarza dostanie daty wyliczone z roku akademickiego.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-40" aria-label="Rok akademicki">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie lata</SelectItem>
            {years?.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={semesterFilter}
          onValueChange={(value) => setSemesterFilter(value as SemesterType | 'all')}
        >
          <SelectTrigger className="w-44" aria-label="Typ semestru">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie semestry</SelectItem>
            {(Object.keys(SEMESTER_TYPE_LABELS) as SemesterType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {SEMESTER_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={modeFilter}
          onValueChange={(value) => setModeFilter(value as StudyMode | 'all')}
        >
          <SelectTrigger className="w-44" aria-label="Tryb studiow">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie tryby</SelectItem>
            {STUDY_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {STUDY_MODE_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={facultyFilter} onValueChange={setFacultyFilter}>
          <SelectTrigger className="w-56" aria-label="Wydzial">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie wydzialy</SelectItem>
            {faculties?.map((faculty) => (
              <SelectItem key={faculty.id} value={faculty.id}>
                {faculty.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
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
                                <SelectItem value={ALL_FACULTIES}>Wszystkie wydzialy</SelectItem>
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
                      <FieldError errors={[form.formState.errors.facultyId]} />
                      <FieldDescription>
                        {!isAdmin
                          ? 'Kalendarz zakladasz dla swojego wydzialu.'
                          : form.watch('facultyId') === ALL_FACULTIES
                            ? 'Powstanie osobny wiersz dla kazdego wydzialu. Te, ktore maja juz wlasny kalendarz dla tego semestru, zostana pominiete.'
                            : 'Kazdy wydzial ma wlasny wiersz — pozostale mozesz ustawic osobno.'}
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

              {cutEntries > 0 && (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertTitle>Poza nowym zakresem zostanie {cutEntries} zajec</AlertTitle>
                  <AlertDescription>
                    Serwer odrzuci takie skrocenie semestru. Najpierw przenies albo usun te
                    terminy, potem zmien daty.
                  </AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            {/* Skrocenie ucinajace zajecia i tak skonczy sie bledem 409 — nie ma po co
                pozwalac w nie kliknac. */}
            <Button
              type="submit"
              form="calendar-form"
              disabled={saveMutation.isPending || cutEntries > 0}
            >
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
            ? `${SEMESTER_TYPE_LABELS[deleting.semesterType]} ${deleting.academicYear}, ${STUDY_MODE_LABELS[
                deleting.studyMode
              ].toLowerCase()} (${deleting.faculty.shortName}). ` +
              // Same daty znikaja, ale plan zostaje — po usunieciu kalendarza kolejne
              // generowanie rozpisze go na INNYM zakresie dat, i to jest tu ryzyko.
              `Zalezy od niego ${deleting.templateCount} wzorcow i ${deleting.entryCount} juz rozpisanych terminow — ` +
              'te zostaja, ale kolejne generowanie uzyje dat wyliczonych z roku akademickiego, ' +
              'wiec moze wypasc na innym zakresie.'
            : ''
        }
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  );
}
