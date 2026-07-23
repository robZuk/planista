import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/data-table/DataTable';
import { SortableHeader } from '@/components/data-table/SortableHeader';
import { createHoliday, deleteHoliday, fetchHolidays } from '@/api/schedule';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLong, toDateKey } from '@/lib/scheduleDates';
import { useAuthStore } from '@/store/authStore';
import type { PublicHoliday } from '@/types';

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Wybierz date'),
  name: z.string().min(3, 'Nazwa musi miec co najmniej 3 znaki'),
});

type HolidayValues = z.infer<typeof holidaySchema>;

const COLUMN_LABELS = { date: 'Data', name: 'Nazwa', weekday: 'Dzien tygodnia' };

export default function HolidaysPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'DEAN_OFFICE';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<PublicHoliday | null>(null);

  const { data, isPending } = useQuery({ queryKey: ['holidays'], queryFn: () => fetchHolidays() });

  const form = useForm<HolidayValues>({
    resolver: zodResolver(holidaySchema),
    defaultValues: { date: '', name: '' },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['holidays'] });

  const createMutation = useMutation({
    mutationFn: (values: HolidayValues) => createHoliday(values),
    onSuccess: () => {
      toast.success('Dzien wolny dodany');
      setDialogOpen(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteHoliday(id),
    onSuccess: () => {
      toast.success('Dzien wolny usuniety');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const columns: ColumnDef<PublicHoliday, unknown>[] = [
    {
      accessorKey: 'date',
      header: ({ column }) => <SortableHeader column={column}>Data</SortableHeader>,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{toDateKey(row.original.date)}</span>
      ),
    },
    {
      id: 'weekday',
      accessorFn: (row) => new Date(row.date).getDay(),
      header: 'Dzien tygodnia',
      cell: ({ row }) => (
        <Badge variant="secondary">
          {new Date(row.original.date).toLocaleDateString('pl-PL', { weekday: 'long' })}
        </Badge>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column}>Nazwa</SortableHeader>,
      cell: ({ row }) => <span>{row.original.name}</span>,
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
                  aria-label={`Usun ${row.original.name}`}
                  onClick={() => setDeleting(row.original)}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          } satisfies ColumnDef<PublicHoliday, unknown>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Dni wolne"
        description="Swieta i dni rektorskie — generator terminow omija te daty."
        actions={
          canEdit && (
            <Button
              onClick={() => {
                form.reset({ date: '', name: '' });
                setDialogOpen(true);
              }}
            >
              <Plus />
              Dodaj dzien wolny
            </Button>
          )
        }
      />

      <Alert>
        <CalendarOff />
        <AlertTitle>Dziala tylko przy generowaniu</AlertTitle>
        <AlertDescription>
          Dodanie dnia wolnego nie usuwa terminow, ktore juz sa w kalendarzu — pomija je dopiero
          kolejne generowanie semestru. Istniejace zajecia odwolaj recznie w kalendarzu.
        </AlertDescription>
      </Alert>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        searchPlaceholder="Szukaj dnia wolnego…"
        columnLabels={COLUMN_LABELS}
        pageSize={15}
        emptyState={
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarOff />
              </EmptyMedia>
              <EmptyTitle>Brak dni wolnych</EmptyTitle>
              <EmptyDescription>
                Bez nich generator ustawi zajecia takze w swieta.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy dzien wolny</DialogTitle>
            <DialogDescription>
              Jedna data = jeden wpis. Dluzsze przerwy dodaj jako kolejne dni.
            </DialogDescription>
          </DialogHeader>

          <form
            id="holiday-form"
            onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="date">Data</FieldLabel>
                <Input
                  id="date"
                  type="date"
                  aria-invalid={!!form.formState.errors.date}
                  {...form.register('date')}
                />
                <FieldError errors={[form.formState.errors.date]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="name">Nazwa</FieldLabel>
                <Input
                  id="name"
                  placeholder="Swieto Niepodleglosci"
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register('name')}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="holiday-form" disabled={createMutation.isPending}>
              {createMutation.isPending && <Spinner />}
              Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Usunac ${deleting?.name ?? ''}?`}
        description={
          deleting
            ? `${formatDateLong(deleting.date)} przestanie byc dniem wolnym przy kolejnym generowaniu.`
            : ''
        }
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  );
}
