import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { createGroup } from '@/api/groups';
import { fetchFieldsOfStudy } from '@/api/fieldsOfStudy';
import { fetchSpecializations } from '@/api/specializations';
import { getErrorMessage } from '@/lib/errors';
import { GROUP_TYPES, GROUP_TYPE_LABELS } from '@/lib/labels';
import type { GroupType, StudentGroup } from '@/types';

const NO_SPECIALIZATION = '__none__';

// Dozwolony typ grupy nadrzednej dla danego typu — lustrzane odbicie backendu
// (groups.controller.ts: allowedParentType), zeby pokazywac/wymagac pola tylko tam,
// gdzie backend i tak by je wymagal.
const PARENT_TYPE: Record<GroupType, GroupType | null> = {
  LECTURE: null,
  EXERCISE: 'LECTURE',
  LAB: 'EXERCISE',
  PROJECT: 'LECTURE',
  SEMINAR: 'LECTURE',
};

const createGroupSchema = z
  .object({
    name: z.string().min(2, 'Nazwa musi miec co najmniej 2 znaki'),
    type: z.enum(GROUP_TYPES as [GroupType, ...GroupType[]]),
    fieldOfStudyId: z.string().min(1, 'Wybierz kierunek'),
    specializationId: z.string().optional(),
    studyYear: z.number({ message: 'Podaj rok' }).int().min(1, 'Rok od 1').max(6, 'Rok do 6'),
    size: z.number({ message: 'Podaj liczbe' }).int().min(1, 'Liczebnosc musi byc wieksza od zera'),
    parentGroupId: z.string().optional(),
  })
  .refine((data) => PARENT_TYPE[data.type] === null || !!data.parentGroupId, {
    message: 'Wybierz grupe nadrzedna',
    path: ['parentGroupId'],
  });

type CreateGroupValues = z.infer<typeof createGroupSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYear: string;
  /** Grupy juz istniejace w tym roku — zrodlo kandydatow na grupe nadrzedna. */
  groups: StudentGroup[] | undefined;
  onSaved: () => void;
}

/** Reczne dodanie pojedynczej grupy — odpowiednik "Generuj grupy", ale bez automatu. */
export function CreateGroupDialog({ open, onOpenChange, academicYear, groups, onSaved }: Props) {
  const queryClient = useQueryClient();
  const { data: fields } = useQuery({
    queryKey: ['fields-of-study'],
    queryFn: () => fetchFieldsOfStudy(),
  });
  const { data: specializations } = useQuery({
    queryKey: ['specializations'],
    queryFn: () => fetchSpecializations(),
  });

  const form = useForm<CreateGroupValues>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: '',
      type: 'LECTURE',
      fieldOfStudyId: '',
      specializationId: NO_SPECIALIZATION,
      studyYear: 1,
      size: 30,
      parentGroupId: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: '',
        type: 'LECTURE',
        fieldOfStudyId: '',
        specializationId: NO_SPECIALIZATION,
        studyYear: 1,
        size: 30,
        parentGroupId: '',
      });
    }
  }, [open, form]);

  const selectedType = form.watch('type');
  const selectedField = form.watch('fieldOfStudyId');
  const selectedStudyYear = form.watch('studyYear');

  const fieldSpecializations =
    specializations?.filter((spec) => spec.fieldOfStudyId === selectedField) ?? [];

  const expectedParentType = PARENT_TYPE[selectedType];
  const parentCandidates =
    groups?.filter(
      (g) =>
        g.type === expectedParentType &&
        g.fieldOfStudyId === selectedField &&
        g.studyYear === selectedStudyYear,
    ) ?? [];

  const createMutation = useMutation({
    mutationFn: (values: CreateGroupValues) =>
      createGroup({
        name: values.name,
        type: values.type,
        size: values.size,
        fieldOfStudyId: values.fieldOfStudyId,
        specializationId:
          values.specializationId === NO_SPECIALIZATION ? undefined : values.specializationId,
        studyYear: values.studyYear,
        academicYear,
        parentGroupId: expectedParentType === null ? undefined : values.parentGroupId,
      }),
    onSuccess: () => {
      toast.success('Grupa utworzona');
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowa grupa</DialogTitle>
          <DialogDescription>Rok akademicki {academicYear} — jak w przelaczniku powyzej.</DialogDescription>
        </DialogHeader>

        <form
          id="create-group-form"
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
          noValidate
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="groupName">Nazwa</FieldLabel>
              <Input
                id="groupName"
                placeholder="EDST-1-C-B"
                aria-invalid={!!form.formState.errors.name}
                {...form.register('name')}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="type">Typ grupy</FieldLabel>
                <Controller
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Nowy typ moze wymagac innej grupy nadrzednej — stary wybor jest nieaktualny.
                        form.setValue('parentGroupId', '');
                      }}
                    >
                      <SelectTrigger id="type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GROUP_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {GROUP_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="studyYear">Rok studiow</FieldLabel>
                <Controller
                  control={form.control}
                  name="studyYear"
                  render={({ field }) => (
                    <Input
                      id="studyYear"
                      type="number"
                      min={1}
                      max={6}
                      aria-invalid={!!form.formState.errors.studyYear}
                      value={field.value}
                      onChange={(e) => {
                        field.onChange(e.target.valueAsNumber);
                        form.setValue('parentGroupId', '');
                      }}
                    />
                  )}
                />
                <FieldError errors={[form.formState.errors.studyYear]} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="fieldOfStudyId">Kierunek</FieldLabel>
                <Controller
                  control={form.control}
                  name="fieldOfStudyId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('specializationId', NO_SPECIALIZATION);
                        form.setValue('parentGroupId', '');
                      }}
                    >
                      <SelectTrigger
                        id="fieldOfStudyId"
                        aria-invalid={!!form.formState.errors.fieldOfStudyId}
                      >
                        <SelectValue placeholder="Wybierz" />
                      </SelectTrigger>
                      <SelectContent>
                        {fields?.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.fieldOfStudyId]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="specializationId">Specjalnosc (opcjonalnie)</FieldLabel>
                <Controller
                  control={form.control}
                  name="specializationId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={!selectedField}>
                      <SelectTrigger id="specializationId">
                        <SelectValue placeholder="Caly kierunek" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SPECIALIZATION}>Caly kierunek</SelectItem>
                        {fieldSpecializations.map((spec) => (
                          <SelectItem key={spec.id} value={spec.id}>
                            {spec.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="size">Liczebnosc</FieldLabel>
              <Controller
                control={form.control}
                name="size"
                render={({ field }) => (
                  <Input
                    id="size"
                    type="number"
                    min={1}
                    aria-invalid={!!form.formState.errors.size}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  />
                )}
              />
              <FieldError errors={[form.formState.errors.size]} />
            </Field>

            {expectedParentType && (
              <Field>
                <FieldLabel htmlFor="parentGroupId">
                  Grupa nadrzedna ({GROUP_TYPE_LABELS[expectedParentType]})
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="parentGroupId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={parentCandidates.length === 0}
                    >
                      <SelectTrigger
                        id="parentGroupId"
                        aria-invalid={!!form.formState.errors.parentGroupId}
                      >
                        <SelectValue placeholder="Wybierz" />
                      </SelectTrigger>
                      <SelectContent>
                        {parentCandidates.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {parentCandidates.length === 0 ? (
                  <FieldDescription>
                    Brak grupy typu {GROUP_TYPE_LABELS[expectedParentType]} dla tego kierunku i roku
                    studiow — utworz ja najpierw.
                  </FieldDescription>
                ) : (
                  <FieldError errors={[form.formState.errors.parentGroupId]} />
                )}
              </Field>
            )}
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button type="submit" form="create-group-form" disabled={createMutation.isPending}>
            {createMutation.isPending && <Spinner />}
            Dodaj grupe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
