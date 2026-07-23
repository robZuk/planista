import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, School } from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { SortableHeader } from '@/components/data-table/SortableHeader';
import {
  createFaculty,
  deleteFaculty,
  fetchFaculties,
  updateFaculty,
  type FacultyInput,
} from '@/api/faculties';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import type { Faculty } from '@/types';

const facultySchema = z.object({
  name: z.string().min(3, 'Nazwa musi miec co najmniej 3 znaki'),
  shortName: z
    .string()
    .min(2, 'Skrot musi miec co najmniej 2 znaki')
    .max(10, 'Skrot moze miec najwyzej 10 znakow'),
});

type FacultyValues = z.infer<typeof facultySchema>;

const COLUMN_LABELS = { name: 'Nazwa', shortName: 'Skrot', createdAt: 'Dodano' };

export default function FacultiesPage() {
  const queryClient = useQueryClient();
  // Dziekanat widzi liste, ale edytowac moze tylko admin (tak samo jak na backendzie).
  const canEdit = useAuthStore((s) => s.user?.role) === 'ADMIN';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Faculty | null>(null);
  const [deleting, setDeleting] = useState<Faculty | null>(null);

  const { data, isPending } = useQuery({ queryKey: ['faculties'], queryFn: fetchFaculties });

  const form = useForm<FacultyValues>({
    resolver: zodResolver(facultySchema),
    defaultValues: { name: '', shortName: '' },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['faculties'] });

  const saveMutation = useMutation({
    mutationFn: (values: FacultyInput) =>
      editing ? updateFaculty(editing.id, values) : createFaculty(values),
    onSuccess: () => {
      toast.success(editing ? 'Wydzial zaktualizowany' : 'Wydzial dodany');
      setDialogOpen(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFaculty(id),
    onSuccess: () => {
      toast.success('Wydzial usuniety');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: '', shortName: '' });
    setDialogOpen(true);
  };

  const openEdit = (faculty: Faculty) => {
    setEditing(faculty);
    form.reset({ name: faculty.name, shortName: faculty.shortName });
    setDialogOpen(true);
  };

  const columns: ColumnDef<Faculty, unknown>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column}>Nazwa</SortableHeader>,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'shortName',
      header: ({ column }) => <SortableHeader column={column}>Skrot</SortableHeader>,
      cell: ({ row }) => <Badge variant="secondary">{row.original.shortName}</Badge>,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <SortableHeader column={column}>Dodano</SortableHeader>,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString('pl-PL')}
        </span>
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
          } satisfies ColumnDef<Faculty, unknown>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Wydzialy"
        description="Jednostki uczelni — do nich przypisane sa kierunki, budynki i prowadzacy."
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus />
              Dodaj wydzial
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        searchPlaceholder="Szukaj wydzialu…"
        columnLabels={COLUMN_LABELS}
        emptyState={
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <School />
              </EmptyMedia>
              <EmptyTitle>Brak wydzialow</EmptyTitle>
              <EmptyDescription>
                Od wydzialu zaczyna sie cala struktura — dodaj pierwszy, zeby ruszyc dalej.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      {/* Jeden dialog obsluguje dodawanie i edycje — rozni je tylko `editing`. */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edytuj wydzial' : 'Nowy wydzial'}</DialogTitle>
            <DialogDescription>
              Skrot pojawia sie w nazwach grup i na planie, wiec trzymaj go krotkim.
            </DialogDescription>
          </DialogHeader>

          <form
            id="faculty-form"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Nazwa</FieldLabel>
                <Input
                  id="name"
                  placeholder="Wydzial Nawigacyjny"
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register('name')}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="shortName">Skrot</FieldLabel>
                <Input
                  id="shortName"
                  placeholder="WN"
                  aria-invalid={!!form.formState.errors.shortName}
                  {...form.register('shortName')}
                />
                <FieldError errors={[form.formState.errors.shortName]} />
              </Field>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="faculty-form" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Spinner />}
              {editing ? 'Zapisz zmiany' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Usunac wydzial ${deleting?.shortName ?? ''}?`}
        description="Tej operacji nie da sie cofnac. Wydzial z przypisanymi kierunkami, budynkami lub prowadzacymi nie zostanie usuniety."
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  );
}
