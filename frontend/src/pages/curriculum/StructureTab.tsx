import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
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
import { Item, ItemContent, ItemActions, ItemGroup, ItemTitle } from '@/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  createFieldOfStudy,
  deleteFieldOfStudy,
  fetchFieldsOfStudy,
} from '@/api/fieldsOfStudy';
import {
  createSpecialization,
  deleteSpecialization,
  fetchSpecializations,
} from '@/api/specializations';
import { fetchFaculties } from '@/api/faculties';
import { getErrorMessage } from '@/lib/errors';
import { useFacultyFilterStore } from '@/store/facultyStore';
import { useAuthStore } from '@/store/authStore';
import type { FieldOfStudy, Specialization } from '@/types';

const fieldSchema = z.object({
  name: z.string().min(3, 'Nazwa musi miec co najmniej 3 znaki'),
  shortName: z.string().min(2, 'Skrot musi miec co najmniej 2 znaki').max(10, 'Najwyzej 10 znakow'),
  facultyId: z.string().min(1, 'Wybierz wydzial'),
});

const specSchema = z.object({
  name: z.string().min(3, 'Nazwa musi miec co najmniej 3 znaki'),
  shortName: z.string().min(2, 'Skrot musi miec co najmniej 2 znaki').max(10, 'Najwyzej 10 znakow'),
});

type FieldValues = z.infer<typeof fieldSchema>;
type SpecValues = z.infer<typeof specSchema>;

/** Kierunki i ich specjalnosci — dwa poziomy tej samej hierarchii, stad accordion. */
export default function StructureTab() {
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.user?.role) === 'ADMIN';

  const [fieldDialog, setFieldDialog] = useState(false);
  const [specDialogFor, setSpecDialogFor] = useState<FieldOfStudy | null>(null);
  const [deletingField, setDeletingField] = useState<FieldOfStudy | null>(null);
  const [deletingSpec, setDeletingSpec] = useState<Specialization | null>(null);

  const { data: fields, isPending } = useQuery({
    queryKey: ['fields-of-study'],
    queryFn: () => fetchFieldsOfStudy(),
  });
  const { data: specializations } = useQuery({
    queryKey: ['specializations'],
    queryFn: () => fetchSpecializations(),
  });
  const { data: faculties } = useQuery({ queryKey: ['faculties'], queryFn: fetchFaculties });
  const facultyId = useFacultyFilterStore((s) => s.facultyId);

  const visibleFields = useMemo(
    () =>
      facultyId === 'all' ? fields : fields?.filter((field) => field.facultyId === facultyId),
    [fields, facultyId],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['fields-of-study'] });
    void queryClient.invalidateQueries({ queryKey: ['specializations'] });
  };

  const fieldForm = useForm<FieldValues>({
    resolver: zodResolver(fieldSchema),
    defaultValues: { name: '', shortName: '', facultyId: '' },
  });

  const specForm = useForm<SpecValues>({
    resolver: zodResolver(specSchema),
    defaultValues: { name: '', shortName: '' },
  });

  const saveField = useMutation({
    mutationFn: (values: FieldValues) => createFieldOfStudy(values),
    onSuccess: () => {
      toast.success('Kierunek dodany');
      setFieldDialog(false);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const removeField = useMutation({
    mutationFn: (id: string) => deleteFieldOfStudy(id),
    onSuccess: () => {
      toast.success('Kierunek usuniety');
      setDeletingField(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const saveSpec = useMutation({
    mutationFn: (values: SpecValues) => {
      if (!specDialogFor) throw new Error('Brak kierunku');
      return createSpecialization({ ...values, fieldOfStudyId: specDialogFor.id });
    },
    onSuccess: () => {
      toast.success('Specjalnosc dodana');
      setSpecDialogFor(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const removeSpec = useMutation({
    mutationFn: (id: string) => deleteSpecialization(id),
    onSuccess: () => {
      toast.success('Specjalnosc usunieta');
      setDeletingSpec(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              fieldForm.reset({ name: '', shortName: '', facultyId: '' });
              setFieldDialog(true);
            }}
          >
            <Plus />
            Dodaj kierunek
          </Button>
        </div>
      )}

      {visibleFields?.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitBranch />
            </EmptyMedia>
            <EmptyTitle>
              {facultyId === 'all' ? 'Brak kierunkow' : 'Brak kierunkow dla tego wydzialu'}
            </EmptyTitle>
            <EmptyDescription>
              {facultyId === 'all'
                ? 'Kierunek nalezy do wydzialu, a specjalnosci do kierunku. Bez tego nie da sie utworzyc siatki godzin.'
                : 'Zmien wydzial w przelaczniku powyzej albo dodaj tu nowy kierunek.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Accordion type="multiple" className="w-full">
          {visibleFields?.map((field) => {
            const specs = specializations?.filter((s) => s.fieldOfStudyId === field.id) ?? [];

            return (
              <AccordionItem key={field.id} value={field.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 pr-2 text-left">
                    <span className="font-medium">{field.name}</span>
                    <Badge variant="secondary">{field.shortName}</Badge>
                    {field.faculty && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {field.faculty.shortName}
                      </span>
                    )}
                    <span className="ml-auto text-sm font-normal text-muted-foreground">
                      {specs.length}{' '}
                      {specs.length === 1 ? 'specjalnosc' : specs.length < 5 ? 'specjalnosci' : 'specjalnosci'}
                    </span>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="space-y-3">
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          specForm.reset({ name: '', shortName: '' });
                          setSpecDialogFor(field);
                        }}
                      >
                        <Plus />
                        Dodaj specjalnosc
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeletingField(field)}>
                        <Trash2 />
                        Usun kierunek
                      </Button>
                    </div>
                  )}

                  {specs.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                      Ten kierunek nie ma jeszcze zadnej specjalnosci.
                    </p>
                  ) : (
                    <ItemGroup className="rounded-lg border">
                      {specs.map((spec) => (
                        <Item key={spec.id} variant="muted" size="sm">
                          <ItemContent>
                            <ItemTitle>
                              {spec.name}
                              <Badge variant="outline">{spec.shortName}</Badge>
                            </ItemTitle>
                          </ItemContent>
                          {canEdit && (
                            <ItemActions>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive hover:text-destructive"
                                aria-label={`Usun specjalnosc ${spec.name}`}
                                onClick={() => setDeletingSpec(spec)}
                              >
                                <Trash2 />
                              </Button>
                            </ItemActions>
                          )}
                        </Item>
                      ))}
                    </ItemGroup>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* ─── Dialog kierunku ─── */}
      <Dialog open={fieldDialog} onOpenChange={setFieldDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy kierunek</DialogTitle>
            <DialogDescription>Kierunek zawsze nalezy do jednego wydzialu.</DialogDescription>
          </DialogHeader>

          <form
            id="field-form"
            onSubmit={fieldForm.handleSubmit((values) => saveField.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="fieldName">Nazwa</FieldLabel>
                <Input
                  id="fieldName"
                  placeholder="Informatyka"
                  aria-invalid={!!fieldForm.formState.errors.name}
                  {...fieldForm.register('name')}
                />
                <FieldError errors={[fieldForm.formState.errors.name]} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="fieldShortName">Skrot</FieldLabel>
                  <Input
                    id="fieldShortName"
                    placeholder="INF"
                    aria-invalid={!!fieldForm.formState.errors.shortName}
                    {...fieldForm.register('shortName')}
                  />
                  <FieldError errors={[fieldForm.formState.errors.shortName]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="fieldFaculty">Wydzial</FieldLabel>
                  <Controller
                    control={fieldForm.control}
                    name="facultyId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger
                          id="fieldFaculty"
                          aria-invalid={!!fieldForm.formState.errors.facultyId}
                        >
                          <SelectValue placeholder="Wybierz" />
                        </SelectTrigger>
                        <SelectContent>
                          {faculties?.map((faculty) => (
                            <SelectItem key={faculty.id} value={faculty.id}>
                              {faculty.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[fieldForm.formState.errors.facultyId]} />
                </Field>
              </div>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldDialog(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="field-form" disabled={saveField.isPending}>
              {saveField.isPending && <Spinner />}
              Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog specjalnosci ─── */}
      <Dialog open={!!specDialogFor} onOpenChange={(open) => !open && setSpecDialogFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowa specjalnosc</DialogTitle>
            <DialogDescription>
              Dla kierunku: {specDialogFor?.name}. To do specjalnosci przypina sie siatke godzin.
            </DialogDescription>
          </DialogHeader>

          <form
            id="spec-form"
            onSubmit={specForm.handleSubmit((values) => saveSpec.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="specName">Nazwa</FieldLabel>
                <Input
                  id="specName"
                  placeholder="Inzynieria oprogramowania"
                  aria-invalid={!!specForm.formState.errors.name}
                  {...specForm.register('name')}
                />
                <FieldError errors={[specForm.formState.errors.name]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="specShortName">Skrot</FieldLabel>
                <Input
                  id="specShortName"
                  placeholder="IO"
                  aria-invalid={!!specForm.formState.errors.shortName}
                  {...specForm.register('shortName')}
                />
                <FieldError errors={[specForm.formState.errors.shortName]} />
              </Field>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSpecDialogFor(null)}>
              Anuluj
            </Button>
            <Button type="submit" form="spec-form" disabled={saveSpec.isPending}>
              {saveSpec.isPending && <Spinner />}
              Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingField}
        onOpenChange={(open) => !open && setDeletingField(null)}
        title={`Usunac kierunek ${deletingField?.shortName ?? ''}?`}
        description="Kierunek z przypisanymi specjalnosciami lub grupami nie zostanie usuniety."
        isPending={removeField.isPending}
        onConfirm={() => deletingField && removeField.mutate(deletingField.id)}
      />

      <ConfirmDialog
        open={!!deletingSpec}
        onOpenChange={(open) => !open && setDeletingSpec(null)}
        title={`Usunac specjalnosc ${deletingSpec?.shortName ?? ''}?`}
        description="Specjalnosc z przypisana siatka godzin nie zostanie usunieta."
        isPending={removeSpec.isPending}
        onConfirm={() => deletingSpec && removeSpec.mutate(deletingSpec.id)}
      />
    </div>
  );
}
