import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Combobox } from '@/components/Combobox';
import {
  addEntry,
  deleteEntry,
  fetchEntries,
  fetchVersions,
  updateEntry,
  type AddEntryInput,
} from '@/api/curriculum';
import { fetchSubjects } from '@/api/subjects';
import { fetchInstructors } from '@/api/instructors';
import { getErrorMessage } from '@/lib/errors';
import {
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABELS,
  DEGREE_LEVEL_LABELS,
  STUDY_MODE_LABELS,
} from '@/lib/labels';
import { SEMESTER_TYPE_LABELS, semesterTypeOf } from '@/lib/semester';
import { useAuthStore } from '@/store/authStore';
import type { AssessmentType, CurriculumEntry } from '@/types';

const NO_INSTRUCTOR = '__none__';

const entrySchema = z.object({
  subjectId: z.string().min(1, 'Wybierz przedmiot'),
  instructorId: z.string().optional(),
  hoursLecture: z.number().int().min(0).max(300),
  hoursExercise: z.number().int().min(0).max(300),
  hoursLab: z.number().int().min(0).max(300),
  hoursProject: z.number().int().min(0).max(300),
  hoursSeminar: z.number().int().min(0).max(300),
  ects: z.number().int().min(0).max(60),
  assessmentType: z.enum(ASSESSMENT_TYPES as [AssessmentType, ...AssessmentType[]]),
});

type EntryValues = z.infer<typeof entrySchema>;

const EMPTY_ENTRY: EntryValues = {
  subjectId: '',
  instructorId: NO_INSTRUCTOR,
  hoursLecture: 0,
  hoursExercise: 0,
  hoursLab: 0,
  hoursProject: 0,
  hoursSeminar: 0,
  ects: 0,
  assessmentType: 'CREDIT',
};

/** Kolumny godzinowe: klucz w formularzu, krotki naglowek i pelna nazwa do tooltipa. */
const HOUR_FIELDS = [
  { key: 'hoursLecture', short: 'W', full: 'Wyklad' },
  { key: 'hoursExercise', short: 'C', full: 'Cwiczenia' },
  { key: 'hoursLab', short: 'L', full: 'Laboratorium' },
  { key: 'hoursProject', short: 'P', full: 'Projekt' },
  { key: 'hoursSeminar', short: 'S', full: 'Seminarium' },
] as const;

export default function CurriculumVersionPage() {
  const { versionId = '' } = useParams();
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.user?.role) === 'ADMIN';

  const [dialogSemester, setDialogSemester] = useState<number | null>(null);
  const [editing, setEditing] = useState<CurriculumEntry | null>(null);
  const [deleting, setDeleting] = useState<CurriculumEntry | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['curriculum-entries', versionId],
    queryFn: () => fetchEntries(versionId),
    enabled: !!versionId,
  });
  // GET /versions/:id/entries zwraca wersje "chuda" — bez specjalnosci i kierunku.
  // Nazwy do naglowka bierzemy wiec z listy wersji, ktora i tak jest w cache.
  const { data: versions } = useQuery({
    queryKey: ['curriculum-versions'],
    queryFn: fetchVersions,
  });
  const { data: subjects } = useQuery({ queryKey: ['subjects'], queryFn: () => fetchSubjects() });
  const { data: instructors } = useQuery({
    queryKey: ['instructors'],
    queryFn: fetchInstructors,
  });

  const form = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: EMPTY_ENTRY,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['curriculum-entries', versionId] });
    void queryClient.invalidateQueries({ queryKey: ['curriculum-versions'] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: EntryValues) => {
      const instructorId = values.instructorId === NO_INSTRUCTOR ? undefined : values.instructorId;

      if (editing) {
        // Backend nie pozwala zmienic przedmiotu ani semestru istniejacego wpisu —
        // `null` jawnie odpina prowadzacego (undefined by go zostawilo bez zmian).
        return updateEntry(editing.id, {
          instructorId: instructorId ?? null,
          hoursLecture: values.hoursLecture,
          hoursExercise: values.hoursExercise,
          hoursLab: values.hoursLab,
          hoursProject: values.hoursProject,
          hoursSeminar: values.hoursSeminar,
          ects: values.ects,
          assessmentType: values.assessmentType,
        });
      }

      const semester = dialogSemester!;
      const existing = data?.semesters.find((s) => s.semester === semester)?.entries ?? [];
      const payload: AddEntryInput = {
        subjectId: values.subjectId,
        instructorId,
        semester,
        // Kolejnosc nadajemy sami — backend jej nie wylicza, a uzytkownika nie interesuje.
        orderInSemester: existing.length + 1,
        hoursLecture: values.hoursLecture,
        hoursExercise: values.hoursExercise,
        hoursLab: values.hoursLab,
        hoursProject: values.hoursProject,
        hoursSeminar: values.hoursSeminar,
        ects: values.ects,
        assessmentType: values.assessmentType,
      };
      return addEntry(versionId, payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Wpis zaktualizowany' : 'Przedmiot dodany do siatki');
      setDialogSemester(null);
      setEditing(null);
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: () => {
      toast.success('Wpis usuniety');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const openAdd = (semester: number) => {
    setEditing(null);
    form.reset(EMPTY_ENTRY);
    setDialogSemester(semester);
  };

  const openEdit = (semester: number, entry: CurriculumEntry) => {
    setEditing(entry);
    form.reset({
      subjectId: entry.subject.id,
      instructorId: entry.instructor?.id ?? NO_INSTRUCTOR,
      hoursLecture: entry.hoursLecture,
      hoursExercise: entry.hoursExercise,
      hoursLab: entry.hoursLab,
      hoursProject: entry.hoursProject,
      hoursSeminar: entry.hoursSeminar,
      ects: entry.ects,
      assessmentType: entry.assessmentType,
    });
    setDialogSemester(semester);
  };

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader title="Siatka godzin" />
        <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
        <Button variant="outline" asChild className="w-fit">
          <Link to="/curriculum">
            <ArrowLeft />
            Wroc do listy siatek
          </Link>
        </Button>
      </>
    );
  }

  const { version, semesters } = data;
  const listed = versions?.find((v) => v.id === versionId);
  const specialization = listed?.specialization;
  const semesterNumbers = Array.from({ length: version.totalSemesters }, (_, i) => i + 1);
  const totalEcts = semesters.reduce((sum, s) => sum + s.totalEcts, 0);

  const subjectOptions =
    subjects?.map((subject) => ({
      value: subject.id,
      label: subject.name,
      keywords: subject.code ?? '',
    })) ?? [];

  return (
    <>
      <PageHeader
        title={specialization?.name ?? 'Siatka godzin'}
        description={[
          specialization?.fieldOfStudy?.name,
          version.academicYear,
          STUDY_MODE_LABELS[version.studyMode],
          DEGREE_LEVEL_LABELS[version.degreeLevel],
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {totalEcts} ECTS lacznie
            </Badge>
            <Button variant="outline" asChild>
              <Link to="/curriculum">
                <ArrowLeft />
                Lista siatek
              </Link>
            </Button>
          </div>
        }
      />

      {/* Semestry rozwijamy z totalSemesters, a nie z danych — puste semestry tez musza byc
          widoczne, inaczej nie da sie do nich nic dodac. */}
      <Accordion type="multiple" defaultValue={['1']} className="w-full">
        {semesterNumbers.map((number) => {
          const semester = semesters.find((s) => s.semester === number);
          const entries = semester?.entries ?? [];
          const type = semesterTypeOf(version.startSemesterType, number);
          const hours = entries.reduce((sum, e) => sum + e.totalHours, 0);

          return (
            <AccordionItem key={number} value={String(number)}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 pr-2 text-left">
                  <span className="font-medium">Semestr {number}</span>
                  <Badge variant={type === 'WINTER' ? 'secondary' : 'outline'}>
                    {SEMESTER_TYPE_LABELS[type]}
                  </Badge>
                  <span className="ml-auto flex items-center gap-3 text-sm font-normal text-muted-foreground tabular-nums">
                    <span>{entries.length} przedm.</span>
                    <span>{hours} godz.</span>
                    <span>{semester?.totalEcts ?? 0} ECTS</span>
                  </span>
                </div>
              </AccordionTrigger>

              <AccordionContent className="space-y-3">
                {canEdit && (
                  <Button size="sm" onClick={() => openAdd(number)}>
                    <Plus />
                    Dodaj przedmiot
                  </Button>
                )}

                {entries.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    Ten semestr jest jeszcze pusty.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">Lp.</TableHead>
                          <TableHead>Przedmiot</TableHead>
                          <TableHead>Prowadzacy</TableHead>
                          {HOUR_FIELDS.map((field) => (
                            <TableHead key={field.key} className="w-12 text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">{field.short}</span>
                                </TooltipTrigger>
                                <TooltipContent>{field.full}</TooltipContent>
                              </Tooltip>
                            </TableHead>
                          ))}
                          <TableHead className="w-16 text-right">Razem</TableHead>
                          <TableHead className="w-16 text-right">ECTS</TableHead>
                          <TableHead>Zaliczenie</TableHead>
                          {canEdit && <TableHead className="w-24" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry, index) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-muted-foreground tabular-nums">
                              {index + 1}
                            </TableCell>
                            <TableCell className="font-medium">
                              {entry.subject.name}
                              {entry.subject.code && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {entry.subject.code}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {entry.instructor
                                ? `${entry.instructor.title ?? ''} ${entry.instructor.firstName} ${entry.instructor.lastName}`.trim()
                                : '—'}
                            </TableCell>
                            {HOUR_FIELDS.map((field) => {
                              const value = entry[field.key];
                              return (
                                <TableCell
                                  key={field.key}
                                  className={
                                    value === 0
                                      ? 'text-right tabular-nums text-muted-foreground/40'
                                      : 'text-right tabular-nums'
                                  }
                                >
                                  {value}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right font-medium tabular-nums">
                              {entry.totalHours}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{entry.ects}</TableCell>
                            <TableCell>
                              <Badge
                                variant={entry.assessmentType === 'EXAM' ? 'default' : 'outline'}
                              >
                                {ASSESSMENT_TYPE_LABELS[entry.assessmentType]}
                              </Badge>
                            </TableCell>
                            {canEdit && (
                              <TableCell>
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEdit(number, entry)}
                                  >
                                    Edytuj
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-destructive hover:text-destructive"
                                    aria-label={`Usun ${entry.subject.name}`}
                                    onClick={() => setDeleting(entry)}
                                  >
                                    <Trash2 />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <Dialog
        open={dialogSemester !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogSemester(null);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edytuj: ${editing.subject.name}` : `Dodaj przedmiot — semestr ${dialogSemester}`}
            </DialogTitle>
            <DialogDescription>
              Godziny podaje sie lacznie na caly semestr, osobno dla kazdej formy zajec.
            </DialogDescription>
          </DialogHeader>

          <form
            id="entry-form"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="subjectId">Przedmiot</FieldLabel>
                <Controller
                  control={form.control}
                  name="subjectId"
                  render={({ field }) =>
                    editing ? (
                      // Przedmiotu istniejacego wpisu nie da sie podmienic — trzeba usunac i dodac nowy.
                      <Input value={editing.subject.name} disabled />
                    ) : (
                      <Combobox
                        id="subjectId"
                        options={subjectOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Wybierz przedmiot"
                        searchPlaceholder="Szukaj po nazwie lub kodzie…"
                        invalid={!!form.formState.errors.subjectId}
                      />
                    )
                  }
                />
                <FieldError errors={[form.formState.errors.subjectId]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="instructorId">Prowadzacy (opcjonalnie)</FieldLabel>
                <Controller
                  control={form.control}
                  name="instructorId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="instructorId">
                        <SelectValue placeholder="Wybierz" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_INSTRUCTOR}>Nieprzypisany</SelectItem>
                        {instructors?.map((instructor) => (
                          <SelectItem key={instructor.id} value={instructor.id}>
                            {`${instructor.title ?? ''} ${instructor.firstName} ${instructor.lastName}`.trim()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <div className="grid grid-cols-5 gap-2">
                {HOUR_FIELDS.map((hourField) => (
                  <Field key={hourField.key}>
                    <FieldLabel htmlFor={hourField.key}>{hourField.short}</FieldLabel>
                    <Input
                      id={hourField.key}
                      type="number"
                      min={0}
                      className="text-right tabular-nums"
                      aria-label={hourField.full}
                      {...form.register(hourField.key, { valueAsNumber: true })}
                    />
                  </Field>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="ects">Punkty ECTS</FieldLabel>
                  <Input
                    id="ects"
                    type="number"
                    min={0}
                    aria-invalid={!!form.formState.errors.ects}
                    {...form.register('ects', { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.ects]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="assessmentType">Forma zaliczenia</FieldLabel>
                  <Controller
                    control={form.control}
                    name="assessmentType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="assessmentType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSESSMENT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {ASSESSMENT_TYPE_LABELS[type]}
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

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogSemester(null);
                setEditing(null);
              }}
            >
              Anuluj
            </Button>
            <Button type="submit" form="entry-form" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Spinner />}
              {editing ? 'Zapisz zmiany' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Usunac ${deleting?.subject.name ?? ''} z siatki?`}
        description="Wpis zniknie razem z powiazanymi wzorcami i terminami zajec. Tej operacji nie da sie cofnac."
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  );
}
