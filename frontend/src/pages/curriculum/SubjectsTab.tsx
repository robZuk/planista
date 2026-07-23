import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/data-table/DataTable';
import { SortableHeader } from '@/components/data-table/SortableHeader';
import { createSubject, deleteSubject, fetchSubjects } from '@/api/subjects';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import type { Subject } from '@/types';

const subjectSchema = z.object({
  name: z.string().min(3, 'Nazwa musi miec co najmniej 3 znaki'),
  code: z.string().optional(),
});

type SubjectValues = z.infer<typeof subjectSchema>;

const COLUMN_LABELS = { name: 'Nazwa', code: 'Kod' };

/** Slownik przedmiotow wspolny dla calej uczelni — ten sam przedmiot bywa na wielu siatkach. */
export default function SubjectsTab() {
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.user?.role) === 'ADMIN';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Subject | null>(null);

  const { data, isPending } = useQuery({ queryKey: ['subjects'], queryFn: () => fetchSubjects() });

  const form = useForm<SubjectValues>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: '', code: '' },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['subjects'] });

  const createMutation = useMutation({
    mutationFn: (values: SubjectValues) =>
      createSubject({ name: values.name, code: values.code || undefined }),
    onSuccess: () => {
      toast.success('Przedmiot dodany');
      setDialogOpen(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSubject(id),
    onSuccess: () => {
      toast.success('Przedmiot usuniety');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const columns: ColumnDef<Subject, unknown>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column}>Nazwa</SortableHeader>,
      enableHiding: false,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'code',
      header: ({ column }) => <SortableHeader column={column}>Kod</SortableHeader>,
      cell: ({ row }) =>
        row.original.code ? (
          <Badge variant="secondary">{row.original.code}</Badge>
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive"
                  aria-label={`Usun przedmiot ${row.original.name}`}
                  onClick={() => setDeleting(row.original)}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          } satisfies ColumnDef<Subject, unknown>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              form.reset({ name: '', code: '' });
              setDialogOpen(true);
            }}
          >
            <Plus />
            Dodaj przedmiot
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        searchPlaceholder="Szukaj przedmiotu…"
        columnLabels={COLUMN_LABELS}
        pageSize={15}
        emptyState={
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpen />
              </EmptyMedia>
              <EmptyTitle>Brak przedmiotow</EmptyTitle>
              <EmptyDescription>
                Przedmioty sa wspolne dla calej uczelni — dodane raz, wchodza do dowolnej siatki.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy przedmiot</DialogTitle>
            <DialogDescription>
              Wymiar godzin i punkty ECTS ustawia sie osobno w kazdej siatce — tutaj tylko nazwa.
            </DialogDescription>
          </DialogHeader>

          <form
            id="subject-form"
            onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="subjectName">Nazwa</FieldLabel>
                <Input
                  id="subjectName"
                  placeholder="Podstawy programowania"
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register('name')}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="subjectCode">Kod (opcjonalnie)</FieldLabel>
                <Input id="subjectCode" placeholder="INF-101" {...form.register('code')} />
                <FieldDescription>Uzywany w zestawieniach i przy wyszukiwaniu.</FieldDescription>
              </Field>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="subject-form" disabled={createMutation.isPending}>
              {createMutation.isPending && <Spinner />}
              Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Usunac przedmiot ${deleting?.name ?? ''}?`}
        description="Przedmiot uzywany w jakiejkolwiek siatce godzin nie zostanie usuniety."
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  );
}
