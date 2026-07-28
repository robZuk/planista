import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, Layers, Plus, Table2, X } from 'lucide-react';
import { toast } from 'sonner';
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
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AcademicYearSelector } from '@/components/AcademicYearSelector';
import { FieldOfStudySelector } from '@/components/FieldOfStudySelector';
import { Combobox } from '@/components/Combobox';
import { DataTable } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { SortableHeader } from '@/components/data-table/SortableHeader';
import {
  createVersion,
  deleteVersion,
  fetchVersions,
  updateVersion,
  type CreateVersionInput,
} from '@/api/curriculum';
import { fetchSpecializations } from '@/api/specializations';
import { getErrorMessage } from '@/lib/errors';
import {
  DEGREE_LEVELS,
  DEGREE_LEVEL_LABELS,
  STUDY_MODES,
  STUDY_MODE_LABELS,
} from '@/lib/labels';
import { SEMESTER_TYPE_LABELS } from '@/lib/semester';
import { useAcademicYearStore } from '@/store/academicYearStore';
import { useFacultyFilterStore } from '@/store/facultyStore';
import { useFieldFilterStore } from '@/store/fieldFilterStore';
import { useAuthStore } from '@/store/authStore';
import type { CurriculumVersion, DegreeLevel, SemesterType } from '@/types';

const versionSchema = z.object({
  specializationId: z.string().min(1, 'Wybierz specjalnosc'),
  academicYear: z
    .string()
    .regex(/^\d{4}\/\d{4}$/, 'Rok w formacie 2024/2025'),
  studyMode: z.enum(STUDY_MODES as [string, ...string[]]),
  degreeLevel: z.enum(DEGREE_LEVELS as [string, ...string[]]),
  startSemesterType: z.enum(['WINTER', 'SUMMER']),
  totalSemesters: z
    .number({ message: 'Podaj liczbe' })
    .int('Liczba semestrow musi byc calkowita')
    .min(1, 'Minimum 1 semestr')
    .max(12, 'Maksimum 12 semestrow'),
});

type VersionValues = z.infer<typeof versionSchema>;

const COLUMN_LABELS = {
  specialization: 'Specjalnosc',
  field: 'Kierunek',
  academicYear: 'Rok',
  studyMode: 'Tryb',
  degreeLevel: 'Stopien',
  totalSemesters: 'Semestry',
  entries: 'Przedmioty',
  isActive: 'Aktywna',
};

export default function VersionsTab() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canEdit = useAuthStore((s) => s.user?.role) === 'ADMIN';
  const academicYear = useAcademicYearStore((s) => s.academicYear);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<CurriculumVersion | null>(null);
  const { facultyId, setFacultyId } = useFacultyFilterStore();
  const { fieldOfStudyId, setFieldOfStudyId } = useFieldFilterStore();
  // Stopien zaweza tylko te liste, wiec zostaje lokalny — w odroznieniu od wydzialu
  // i kierunku, ktore sa wspolnym kontekstem calej aplikacji.
  const [degreeLevel, setDegreeLevel] = useState<DegreeLevel | 'all'>('all');

  const { data: versions, isPending } = useQuery({
    queryKey: ['curriculum-versions'],
    queryFn: fetchVersions,
  });
  const { data: specializations } = useQuery({
    queryKey: ['specializations'],
    queryFn: () => fetchSpecializations(),
  });

  // Rok akademicki to kontekst calego widoku — poza nim nie ma czego pokazywac, wiec
  // filtruje osobno: sluzy tez za mianownik licznika "N z M".
  const inYear = useMemo(
    () => versions?.filter((version) => version.academicYear === academicYear),
    [versions, academicYear],
  );

  // Wydzial i kierunek zawezaja przez specjalnosc (siatka nie ma wlasnego facultyId
  // ani fieldOfStudyId), stopien juz bezposrednio.
  const visible = useMemo(
    () =>
      inYear?.filter((version) => {
        const field = version.specialization?.fieldOfStudy;
        if (facultyId !== 'all' && field?.faculty?.id !== facultyId) return false;
        if (fieldOfStudyId !== 'all' && field?.id !== fieldOfStudyId) return false;
        if (degreeLevel !== 'all' && version.degreeLevel !== degreeLevel) return false;
        return true;
      }),
    [inYear, facultyId, fieldOfStudyId, degreeLevel],
  );

  const isNarrowed = facultyId !== 'all' || fieldOfStudyId !== 'all' || degreeLevel !== 'all';

  const resetFilters = () => {
    setFacultyId('all');
    setFieldOfStudyId('all');
    setDegreeLevel('all');
  };

  const form = useForm<VersionValues>({
    resolver: zodResolver(versionSchema),
    defaultValues: {
      specializationId: '',
      academicYear,
      studyMode: 'FULL_TIME',
      degreeLevel: 'BACHELOR',
      startSemesterType: 'WINTER',
      totalSemesters: 7,
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['curriculum-versions'] });
    void queryClient.invalidateQueries({ queryKey: ['academic-years'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: VersionValues) => createVersion(values as CreateVersionInput),
    onSuccess: () => {
      toast.success('Siatka utworzona');
      setDialogOpen(false);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateVersion(id, { isActive }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVersion(id),
    onSuccess: () => {
      toast.success('Siatka usunieta');
      setDeleting(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openCreate = () => {
    form.reset({
      specializationId: '',
      academicYear,
      studyMode: 'FULL_TIME',
      degreeLevel: 'BACHELOR',
      startSemesterType: 'WINTER',
      totalSemesters: 7,
    });
    setDialogOpen(true);
  };

  const columns: ColumnDef<CurriculumVersion, unknown>[] = [
    {
      id: 'specialization',
      accessorFn: (row) => row.specialization?.name ?? '',
      header: ({ column }) => <SortableHeader column={column}>Specjalnosc</SortableHeader>,
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          to={`/curriculum/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.specialization?.name ?? '—'}
        </Link>
      ),
    },
    {
      id: 'field',
      accessorFn: (row) => row.specialization?.fieldOfStudy?.shortName ?? '',
      header: 'Kierunek',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.specialization?.fieldOfStudy?.name ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'studyMode',
      header: 'Tryb',
      cell: ({ row }) => (
        <Badge variant="outline">{STUDY_MODE_LABELS[row.original.studyMode]}</Badge>
      ),
    },
    {
      accessorKey: 'degreeLevel',
      header: 'Stopien',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {DEGREE_LEVEL_LABELS[row.original.degreeLevel]}
        </span>
      ),
    },
    {
      accessorKey: 'totalSemesters',
      header: ({ column }) => <SortableHeader column={column}>Semestry</SortableHeader>,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.totalSemesters}{' '}
          <span className="text-muted-foreground">
            (start: {SEMESTER_TYPE_LABELS[row.original.startSemesterType].toLowerCase()})
          </span>
        </span>
      ),
    },
    {
      id: 'entries',
      accessorFn: (row) => row._count?.entries ?? 0,
      header: 'Przedmioty',
      cell: ({ row }) => <Badge variant="secondary">{row.original._count?.entries ?? 0}</Badge>,
    },
    {
      accessorKey: 'isActive',
      header: 'Aktywna',
      cell: ({ row }) => (
        <Switch
          checked={row.original.isActive}
          disabled={!canEdit || toggleActive.isPending}
          aria-label="Siatka aktywna"
          onCheckedChange={(isActive) => toggleActive.mutate({ id: row.original.id, isActive })}
        />
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      size: 60,
      cell: ({ row }) => (
        <div className="text-right">
          <RowActions
            onEdit={() => navigate(`/curriculum/${row.original.id}`)}
            onDelete={() => setDeleting(row.original)}
          >
            <DropdownMenuItem onSelect={() => navigate(`/curriculum/${row.original.id}`)}>
              <ExternalLink />
              Otworz przedmioty
            </DropdownMenuItem>
          </RowActions>
        </div>
      ),
    },
  ];

  const specializationOptions =
    specializations?.map((spec) => ({
      value: spec.id,
      label: `${spec.fieldOfStudy?.shortName ?? '?'} — ${spec.name}`,
      keywords: spec.shortName,
    })) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AcademicYearSelector yearOnly />
          <FieldOfStudySelector />

          <Select
            value={degreeLevel}
            onValueChange={(value) => setDegreeLevel(value as DegreeLevel | 'all')}
          >
            <SelectTrigger className="w-48" aria-label="Stopien studiow">
              <Layers className="size-4 text-muted-foreground" />
              <SelectValue placeholder="Stopien" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Oba stopnie</SelectItem>
              {DEGREE_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {DEGREE_LEVEL_LABELS[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isNarrowed && (
            <>
              <span className="text-sm text-muted-foreground tabular-nums">
                {visible?.length ?? 0} z {inYear?.length ?? 0}
              </span>
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X />
                Wyczysc filtry
              </Button>
            </>
          )}
        </div>

        {canEdit && (
          <Button onClick={openCreate}>
            <Plus />
            Nowa siatka
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={visible}
        isLoading={isPending}
        searchPlaceholder="Szukaj specjalnosci…"
        columnLabels={COLUMN_LABELS}
        emptyState={
          // Rok bez ani jednej siatki to co innego niz rok, z ktorego filtry wszystko wyciely —
          // w drugim przypadku podpowiadamy wyczyszczenie zamiast zakladania nowej siatki.
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Table2 />
              </EmptyMedia>
              {isNarrowed && (inYear?.length ?? 0) > 0 ? (
                <>
                  <EmptyTitle>Zadna siatka nie pasuje do filtrow</EmptyTitle>
                  <EmptyDescription>
                    W roku {academicYear} jest {inYear?.length} siatek, ale wybrany wydzial,
                    kierunek lub stopien je odsiewa.
                  </EmptyDescription>
                </>
              ) : (
                <>
                  <EmptyTitle>Brak siatek dla roku {academicYear}</EmptyTitle>
                  <EmptyDescription>
                    Siatka wiaze specjalnosc z rokiem i trybem studiow. Zmien rok w przelaczniku
                    powyzej albo utworz nowa.
                  </EmptyDescription>
                </>
              )}
            </EmptyHeader>
            {isNarrowed && (
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <X />
                  Wyczysc filtry
                </Button>
              </EmptyContent>
            )}
          </Empty>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowa siatka godzin</DialogTitle>
            <DialogDescription>
              Specjalnosc, rok i tryb tworza razem klucz — takiej kombinacji nie da sie powtorzyc.
            </DialogDescription>
          </DialogHeader>

          <form
            id="version-form"
            onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="specializationId">Specjalnosc</FieldLabel>
                <Controller
                  control={form.control}
                  name="specializationId"
                  render={({ field }) => (
                    <Combobox
                      id="specializationId"
                      options={specializationOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Wybierz specjalnosc"
                      searchPlaceholder="Szukaj specjalnosci…"
                      invalid={!!form.formState.errors.specializationId}
                    />
                  )}
                />
                <FieldError errors={[form.formState.errors.specializationId]} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="academicYear">Rok akademicki</FieldLabel>
                  <Input
                    id="academicYear"
                    placeholder="2024/2025"
                    aria-invalid={!!form.formState.errors.academicYear}
                    {...form.register('academicYear')}
                  />
                  <FieldError errors={[form.formState.errors.academicYear]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="totalSemesters">Liczba semestrow</FieldLabel>
                  <Input
                    id="totalSemesters"
                    type="number"
                    min={1}
                    max={12}
                    aria-invalid={!!form.formState.errors.totalSemesters}
                    {...form.register('totalSemesters', { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.totalSemesters]} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="studyMode">Tryb</FieldLabel>
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
                  <FieldLabel htmlFor="degreeLevel">Stopien</FieldLabel>
                  <Controller
                    control={form.control}
                    name="degreeLevel"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="degreeLevel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DEGREE_LEVELS.map((level) => (
                            <SelectItem key={level} value={level}>
                              {DEGREE_LEVEL_LABELS[level]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="startSemesterType">Semestr startowy</FieldLabel>
                <Controller
                  control={form.control}
                  name="startSemesterType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="startSemesterType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['WINTER', 'SUMMER'] as SemesterType[]).map((type) => (
                          <SelectItem key={type} value={type}>
                            {SEMESTER_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>
                  Od tego zalezy, ktore semestry wypadaja zima, a ktore latem — nabor lutowy ma
                  odwrotny uklad niz wrzesniowy.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="version-form" disabled={createMutation.isPending}>
              {createMutation.isPending && <Spinner />}
              Utworz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Usunac siatke ${deleting?.specialization?.name ?? ''}?`}
        description="Razem z siatka znikna wszystkie jej przedmioty ORAZ wzorce i terminy zajec zbudowane na ich podstawie. Tej operacji nie da sie cofnac."
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  );
}
