import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Sparkles, Trash2, Users } from 'lucide-react';
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
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
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AcademicYearSelector } from '@/components/AcademicYearSelector';
import { FacultySelector } from '@/components/FacultySelector';
import {
  deleteAllGroups,
  deleteGroup,
  fetchGroups,
  updateGroup,
} from '@/api/groups';
import { fetchFieldsOfStudy } from '@/api/fieldsOfStudy';
import { fetchSpecializations } from '@/api/specializations';
import { getErrorMessage } from '@/lib/errors';
import { GROUP_TYPE_LABELS, STUDY_MODE_LABELS } from '@/lib/labels';
import { useAcademicYearStore } from '@/store/academicYearStore';
import { useFacultyFilterStore } from '@/store/facultyStore';
import { useAuthStore } from '@/store/authStore';
import { GenerateGroupsDialog } from './groups/GenerateGroupsDialog';
import { CreateGroupDialog } from './groups/CreateGroupDialog';
import { cn } from '@/lib/utils';
import type { GroupType, StudentGroup } from '@/types';

const editSchema = z.object({
  name: z.string().min(2, 'Nazwa musi miec co najmniej 2 znaki'),
  size: z.number({ message: 'Podaj liczbe' }).int().min(1, 'Liczebnosc musi byc wieksza od zera'),
});

type EditValues = z.infer<typeof editSchema>;

/** Kolor plakietki typu grupy — zeby poziomy hierarchii dalo sie rozroznic wzrokiem. */
const TYPE_VARIANT: Record<GroupType, 'default' | 'secondary' | 'outline'> = {
  LECTURE: 'default',
  EXERCISE: 'secondary',
  LAB: 'outline',
  PROJECT: 'secondary',
  SEMINAR: 'secondary',
};

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.user?.role) === 'ADMIN';
  const academicYear = useAcademicYearStore((s) => s.academicYear);
  const facultyId = useFacultyFilterStore((s) => s.facultyId);

  const [fieldFilter, setFieldFilter] = useState('all');
  const [specializationFilter, setSpecializationFilter] = useState('all');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StudentGroup | null>(null);
  const [deleting, setDeleting] = useState<StudentGroup | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);

  const { data: groups, isPending } = useQuery({
    queryKey: ['groups', academicYear],
    queryFn: () => fetchGroups({ academicYear }),
  });
  const { data: fields } = useQuery({
    queryKey: ['fields-of-study'],
    queryFn: () => fetchFieldsOfStudy(),
  });
  const { data: specializations } = useQuery({
    queryKey: ['specializations'],
    queryFn: () => fetchSpecializations(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['groups'] });

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: '', size: 1 },
  });

  const saveMutation = useMutation({
    mutationFn: (values: EditValues) => updateGroup(editing!.id, values),
    onSuccess: () => {
      toast.success('Grupa zaktualizowana');
      setEditing(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: () => {
      toast.success('Grupa usunieta');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const purgeMutation = useMutation({
    mutationFn: () => deleteAllGroups(academicYear),
    onSuccess: () => {
      toast.success(`Usunieto grupy z roku ${academicYear}`);
      setPurgeOpen(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // Grupa nie ma bezposrednio facultyId — wyliczamy go przez jej kierunek (fieldOfStudyId).
  const fieldFacultyMap = useMemo(
    () => new Map(fields?.map((field) => [field.id, field.facultyId]) ?? []),
    [fields],
  );

  // Kaskada: wydzial zaweza kierunki i specjalnosci, kierunek dodatkowo zaweza specjalnosci.
  const fieldOptions = useMemo(
    () => (facultyId === 'all' ? fields : fields?.filter((field) => field.facultyId === facultyId)),
    [fields, facultyId],
  );

  const specializationOptions = useMemo(() => {
    if (fieldFilter !== 'all') {
      return specializations?.filter((spec) => spec.fieldOfStudyId === fieldFilter);
    }
    if (facultyId !== 'all') {
      return specializations?.filter((spec) => spec.fieldOfStudy?.facultyId === facultyId);
    }
    return specializations;
  }, [specializations, fieldFilter, facultyId]);

  // Jesli wybrany filtr wypadnie poza aktualne opcje (np. zmiana wydzialu wyzej w kaskadzie),
  // cofamy go na "Wszystkie" zamiast pokazywac martwy wybor.
  useEffect(() => {
    if (fieldFilter !== 'all' && !fieldOptions?.some((field) => field.id === fieldFilter)) {
      setFieldFilter('all');
    }
  }, [fieldOptions, fieldFilter]);

  useEffect(() => {
    if (
      specializationFilter !== 'all' &&
      !specializationOptions?.some((spec) => spec.id === specializationFilter)
    ) {
      setSpecializationFilter('all');
    }
  }, [specializationOptions, specializationFilter]);

  const filtered = useMemo(
    () =>
      groups?.filter((group) => {
        if (fieldFilter !== 'all' && group.fieldOfStudyId !== fieldFilter) return false;
        if (specializationFilter !== 'all' && group.specializationId !== specializationFilter) {
          return false;
        }
        if (facultyId !== 'all' && fieldFacultyMap.get(group.fieldOfStudyId) !== facultyId) return false;
        return true;
      }),
    [groups, fieldFilter, specializationFilter, facultyId, fieldFacultyMap],
  );

  /**
   * Grupujemy po roku studiow. Backend zwraca plaska liste ze wskaznikami parentGroupId,
   * wiec drzewo budujemy tu: korzenie (bez rodzica) i dzieci szukane po parentGroupId.
   */
  const byStudyYear = useMemo(() => {
    const map = new Map<number, StudentGroup[]>();
    for (const group of filtered ?? []) {
      if (!map.has(group.studyYear)) map.set(group.studyYear, []);
      map.get(group.studyYear)!.push(group);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [filtered]);

  const openEdit = (group: StudentGroup) => {
    setEditing(group);
    form.reset({ name: group.name, size: group.size });
  };

  /** Rekurencyjny wiersz drzewa — wciecie rosnie z poziomem zagniezdzenia. */
  const renderGroup = (group: StudentGroup, all: StudentGroup[], level: number) => {
    const children = all.filter((candidate) => candidate.parentGroupId === group.id);

    return (
      <div key={group.id}>
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 last:border-b-0',
            level > 0 && 'bg-muted/30',
          )}
          style={{ paddingLeft: `${level * 24 + 12}px` }}
        >
          <span className="font-medium">{group.name}</span>
          <Badge variant={TYPE_VARIANT[group.type]}>{GROUP_TYPE_LABELS[group.type]}</Badge>
          {group.studyMode === 'PART_TIME' && (
            <Badge variant="outline">{STUDY_MODE_LABELS.PART_TIME}</Badge>
          )}
          <span className="flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
            <Users className="size-3.5" />
            {group.size}
          </span>
          {canEdit && (
            <div className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Edytuj grupe ${group.name}`}
                onClick={() => openEdit(group)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                aria-label={`Usun grupe ${group.name}`}
                onClick={() => setDeleting(group)}
              >
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
        {children.map((child) => renderGroup(child, all, level + 1))}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Grupy"
        description="Grupy sa tworzone na ROK STUDIOW, nie na semestr — te same osoby chodza na cwiczenia zima i latem."
        actions={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus />
                Dodaj grupe
              </Button>
              <Button onClick={() => setGenerateOpen(true)}>
                <Sparkles />
                Generuj grupy
              </Button>
              <Button
                variant="outline"
                onClick={() => setPurgeOpen(true)}
                disabled={!groups || groups.length === 0}
              >
                <Trash2 />
                Usun wszystkie
              </Button>
            </div>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <AcademicYearSelector yearOnly />
        <FacultySelector />
        <Select value={fieldFilter} onValueChange={setFieldFilter}>
          <SelectTrigger className="w-64" aria-label="Kierunek">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie kierunki</SelectItem>
            {fieldOptions?.map((field) => (
              <SelectItem key={field.id} value={field.id}>
                {field.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={specializationFilter} onValueChange={setSpecializationFilter}>
          <SelectTrigger className="w-64" aria-label="Specjalnosc">
            <SelectValue placeholder="Specjalnosc" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie specjalnosci</SelectItem>
            {specializationOptions?.map((spec) => (
              <SelectItem key={spec.id} value={spec.id}>
                {spec.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : byStudyYear.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Brak grup w roku {academicYear}</EmptyTitle>
            <EmptyDescription>
              Generator odczyta z aktywnej siatki godzin, jakie formy zajec sa potrzebne, i
              zaproponuje komplet grup. Zanim cokolwiek zapisze, pokaze podglad.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Accordion type="multiple" defaultValue={byStudyYear.map(([year]) => String(year))}>
          {byStudyYear.map(([year, yearGroups]) => {
            const roots = yearGroups.filter((group) => !group.parentGroupId);
            const students = roots
              .filter((group) => group.type === 'LECTURE')
              .reduce((sum, group) => sum + group.size, 0);

            return (
              <AccordionItem key={year} value={String(year)}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 pr-2 text-left">
                    <span className="font-medium">Rok studiow {year}</span>
                    <span className="ml-auto flex items-center gap-3 text-sm font-normal text-muted-foreground tabular-nums">
                      <span>{yearGroups.length} grup</span>
                      {students > 0 && <span>{students} studentow</span>}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="overflow-hidden rounded-lg border">
                    {/* Zaczynamy od korzeni; dzieci dokladane sa rekurencyjnie z wcieciem. */}
                    {roots.map((group) => renderGroup(group, yearGroups, 0))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <GenerateGroupsDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        academicYear={academicYear}
        onSaved={invalidate}
      />

      <CreateGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        academicYear={academicYear}
        groups={groups}
        onSaved={invalidate}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj grupe</DialogTitle>
            <DialogDescription>
              Typ grupy i jej miejsce w hierarchii sa stale — mozna zmienic nazwe i liczebnosc.
            </DialogDescription>
          </DialogHeader>

          <form
            id="group-form"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="groupName">Nazwa</FieldLabel>
                <Input
                  id="groupName"
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register('name')}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="groupSize">Liczebnosc</FieldLabel>
                <Input
                  id="groupSize"
                  type="number"
                  min={1}
                  aria-invalid={!!form.formState.errors.size}
                  {...form.register('size', { valueAsNumber: true })}
                />
                <FieldError errors={[form.formState.errors.size]} />
              </Field>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Anuluj
            </Button>
            <Button type="submit" form="group-form" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Spinner />}
              Zapisz zmiany
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Usunac grupe ${deleting?.name ?? ''}?`}
        description="Grupa z podgrupami lub przypisana do zajec w planie nie zostanie usunieta."
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />

      <ConfirmDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title={`Usunac WSZYSTKIE grupy z roku ${academicYear}?`}
        description="Znikna wszystkie grupy tego roku akademickiego wraz z podgrupami. Tej operacji nie da sie cofnac."
        confirmLabel="Usun wszystkie"
        isPending={purgeMutation.isPending}
        onConfirm={() => purgeMutation.mutate()}
      />
    </>
  );
}
