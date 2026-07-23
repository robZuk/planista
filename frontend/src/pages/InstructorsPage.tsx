import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { GraduationCap, Plus } from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { SortableHeader } from '@/components/data-table/SortableHeader';
import {
  createInstructor,
  deleteInstructor,
  fetchInstructors,
  updateInstructor,
  type InstructorInput,
} from '@/api/instructors';
import { fetchFaculties } from '@/api/faculties';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import type { Instructor } from '@/types';

/** Radix Select nie przyjmuje pustego stringa jako wartosci — stad wartownik. */
const NO_FACULTY = '__none__';

const instructorSchema = z.object({
  firstName: z.string().min(2, 'Imie musi miec co najmniej 2 znaki'),
  lastName: z.string().min(2, 'Nazwisko musi miec co najmniej 2 znaki'),
  email: z.string().min(1, 'Podaj adres email').email('To nie wyglada na adres email'),
  title: z.string().optional(),
  facultyId: z.string().optional(),
});

type InstructorValues = z.infer<typeof instructorSchema>;

const COLUMN_LABELS = {
  title: 'Tytul',
  lastName: 'Nazwisko',
  firstName: 'Imie',
  email: 'E-mail',
  faculty: 'Wydzial',
};

export default function InstructorsPage() {
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.user?.role) === 'ADMIN';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Instructor | null>(null);
  const [deleting, setDeleting] = useState<Instructor | null>(null);
  const [facultyFilter, setFacultyFilter] = useState<string>('all');

  const { data: instructors, isPending } = useQuery({
    queryKey: ['instructors'],
    queryFn: fetchInstructors,
  });
  const { data: faculties } = useQuery({ queryKey: ['faculties'], queryFn: fetchFaculties });

  // Filtr wydzialu dziala obok globalnej szukajki DataTable, wiec zawezamy dane wejsciowe.
  const visible = useMemo(() => {
    if (facultyFilter === 'all') return instructors;
    return instructors?.filter((i) => i.facultyId === facultyFilter);
  }, [instructors, facultyFilter]);

  const form = useForm<InstructorValues>({
    resolver: zodResolver(instructorSchema),
    defaultValues: { firstName: '', lastName: '', email: '', title: '', facultyId: NO_FACULTY },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['instructors'] });

  const saveMutation = useMutation({
    mutationFn: (values: InstructorValues) => {
      const payload: InstructorInput = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        title: values.title || undefined,
        facultyId: values.facultyId === NO_FACULTY ? undefined : values.facultyId,
      };
      return editing ? updateInstructor(editing.id, payload) : createInstructor(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Dane prowadzacego zaktualizowane' : 'Prowadzacy dodany');
      setDialogOpen(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInstructor(id),
    onSuccess: () => {
      toast.success('Prowadzacy usuniety');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ firstName: '', lastName: '', email: '', title: '', facultyId: NO_FACULTY });
    setDialogOpen(true);
  };

  const openEdit = (instructor: Instructor) => {
    setEditing(instructor);
    form.reset({
      firstName: instructor.firstName,
      lastName: instructor.lastName,
      email: instructor.email,
      title: instructor.title ?? '',
      facultyId: instructor.facultyId ?? NO_FACULTY,
    });
    setDialogOpen(true);
  };

  const columns: ColumnDef<Instructor, unknown>[] = [
    {
      accessorKey: 'title',
      header: 'Tytul',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.title ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'lastName',
      header: ({ column }) => <SortableHeader column={column}>Nazwisko</SortableHeader>,
      cell: ({ row }) => <span className="font-medium">{row.original.lastName}</span>,
    },
    {
      accessorKey: 'firstName',
      header: ({ column }) => <SortableHeader column={column}>Imie</SortableHeader>,
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <SortableHeader column={column}>E-mail</SortableHeader>,
      cell: ({ row }) => (
        <a href={`mailto:${row.original.email}`} className="text-primary hover:underline">
          {row.original.email}
        </a>
      ),
    },
    {
      id: 'faculty',
      // Wartosc do sortowania/wyszukiwania musi byc plaskim tekstem, nie obiektem.
      accessorFn: (row) => row.faculty?.shortName ?? '',
      header: 'Wydzial',
      cell: ({ row }) =>
        row.original.faculty ? (
          <Badge variant="secondary">{row.original.faculty.shortName}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    ...(canEdit
      ? [
          {
            id: 'actions',
            enableHiding: false,
            size: 60,
            cell: ({ row }) => (
              <div className="text-right">
                <RowActions
                  onEdit={() => openEdit(row.original)}
                  onDelete={() => setDeleting(row.original)}
                />
              </div>
            ),
          } satisfies ColumnDef<Instructor, unknown>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Prowadzacy"
        description="Kadra dydaktyczna — przypisywana do przedmiotow w siatce godzin i do zajec w planie."
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus />
              Dodaj prowadzacego
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={visible}
        isLoading={isPending}
        searchPlaceholder="Szukaj po nazwisku lub e-mailu…"
        columnLabels={COLUMN_LABELS}
        toolbar={
          <Select value={facultyFilter} onValueChange={setFacultyFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Wydzial" />
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
        }
        emptyState={
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GraduationCap />
              </EmptyMedia>
              <EmptyTitle>Brak prowadzacych</EmptyTitle>
              <EmptyDescription>
                Bez prowadzacych nie da sie ulozyc planu — dodaj pierwsza osobe.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edytuj prowadzacego' : 'Nowy prowadzacy'}</DialogTitle>
            <DialogDescription>
              E-mail musi byc unikalny — sluzy tez do powiazania z kontem uzytkownika.
            </DialogDescription>
          </DialogHeader>

          <form
            id="instructor-form"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="firstName">Imie</FieldLabel>
                  <Input
                    id="firstName"
                    aria-invalid={!!form.formState.errors.firstName}
                    {...form.register('firstName')}
                  />
                  <FieldError errors={[form.formState.errors.firstName]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="lastName">Nazwisko</FieldLabel>
                  <Input
                    id="lastName"
                    aria-invalid={!!form.formState.errors.lastName}
                    {...form.register('lastName')}
                  />
                  <FieldError errors={[form.formState.errors.lastName]} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="j.kowalski@umg.edu.pl"
                  aria-invalid={!!form.formState.errors.email}
                  {...form.register('email')}
                />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="title">Tytul (opcjonalnie)</FieldLabel>
                  <Input id="title" placeholder="dr hab. inz." {...form.register('title')} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="facultyId">Wydzial (opcjonalnie)</FieldLabel>
                  <Controller
                    control={form.control}
                    name="facultyId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="facultyId">
                          <SelectValue placeholder="Wybierz wydzial" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_FACULTY}>Bez wydzialu</SelectItem>
                          {faculties?.map((faculty) => (
                            <SelectItem key={faculty.id} value={faculty.id}>
                              {faculty.name}
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="instructor-form" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Spinner />}
              {editing ? 'Zapisz zmiany' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Usunac ${deleting?.firstName ?? ''} ${deleting?.lastName ?? ''}?`}
        description="Tej operacji nie da sie cofnac. Prowadzacy przypisany do zajec w planie nie zostanie usuniety."
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  );
}
