import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Clock, Plus, Trash2 } from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/data-table/DataTable';
import { createTimeBlock, deleteTimeBlock, fetchTimeBlocks } from '@/api/timeBlocks';
import { getErrorMessage } from '@/lib/errors';
import type { TimeBlock } from '@/types';

/** Backend przyjmuje wylacznie pelne godziny — ten sam warunek stawiamy na froncie. */
const timeBlockSchema = z.object({
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):00$/, 'Podaj pelna godzine, np. 08:00'),
});

type TimeBlockValues = z.infer<typeof timeBlockSchema>;

const COLUMN_LABELS = { order: 'Nr', label: 'Etykieta', startTime: 'Poczatek', endTime: 'Koniec' };

export default function TimeBlocksPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<TimeBlock | null>(null);

  const { data, isPending } = useQuery({ queryKey: ['time-blocks'], queryFn: fetchTimeBlocks });

  const form = useForm<TimeBlockValues>({
    resolver: zodResolver(timeBlockSchema),
    defaultValues: { startTime: '08:00' },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['time-blocks'] });

  const createMutation = useMutation({
    mutationFn: (values: TimeBlockValues) => createTimeBlock(values.startTime),
    onSuccess: () => {
      toast.success('Blok czasowy dodany');
      setDialogOpen(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTimeBlock(id),
    onSuccess: () => {
      toast.success('Blok czasowy usuniety');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const columns: ColumnDef<TimeBlock, unknown>[] = [
    {
      accessorKey: 'order',
      header: 'Nr',
      size: 60,
      enableHiding: false,
      cell: ({ row }) => <Badge variant="secondary">{row.original.order}</Badge>,
    },
    {
      accessorKey: 'label',
      header: 'Etykieta',
      cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
    },
    {
      accessorKey: 'startTime',
      header: 'Poczatek',
      cell: ({ row }) => <span className="tabular-nums">{row.original.startTime}</span>,
    },
    {
      accessorKey: 'endTime',
      header: 'Koniec',
      cell: ({ row }) => <span className="tabular-nums">{row.original.endTime}</span>,
    },
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
            aria-label={`Usun blok ${row.original.label}`}
            onClick={() => setDeleting(row.original)}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Bloki czasowe"
        description="Godzinowa siatka, na ktorej opiera sie caly plan zajec."
        actions={
          <Button
            onClick={() => {
              form.reset({ startTime: '08:00' });
              setDialogOpen(true);
            }}
          >
            <Plus />
            Dodaj blok
          </Button>
        }
      />

      <Alert>
        <Clock />
        <AlertTitle>Numeracja liczy sie sama</AlertTitle>
        <AlertDescription>
          Bloki trwaja dokladnie godzine, a ich numery (Nr) backend przelicza po kazdej zmianie
          wedlug godziny rozpoczecia. Dlatego bloku nie edytuje sie — dodaje sie nowy albo usuwa
          istniejacy.
        </AlertDescription>
      </Alert>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        columnLabels={COLUMN_LABELS}
        // Blokow jest kilkanascie i tworza uporzadkowana siatke — dzielenie ich na strony
        // tylko utrudnialoby czytanie.
        pageSize={0}
        emptyState={
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock />
              </EmptyMedia>
              <EmptyTitle>Brak blokow czasowych</EmptyTitle>
              <EmptyDescription>
                Bez siatki godzin nie da sie ustawic zadnych zajec.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy blok czasowy</DialogTitle>
            <DialogDescription>
              Podaj godzine rozpoczecia — koniec i numer wylicza backend.
            </DialogDescription>
          </DialogHeader>

          <form
            id="time-block-form"
            onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="startTime">Godzina rozpoczecia</FieldLabel>
                <Input
                  id="startTime"
                  type="time"
                  step={3600}
                  aria-invalid={!!form.formState.errors.startTime}
                  {...form.register('startTime')}
                />
                <FieldDescription>Tylko pelne godziny, np. 08:00, 09:00.</FieldDescription>
                <FieldError errors={[form.formState.errors.startTime]} />
              </Field>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="time-block-form" disabled={createMutation.isPending}>
              {createMutation.isPending && <Spinner />}
              Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Usunac blok ${deleting?.label ?? ''}?`}
        description="Pozostale bloki zostana przenumerowane. Blok uzywany w planie zajec nie zostanie usuniety."
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  );
}
