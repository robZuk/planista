import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Sparkles } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { confirmGroups, generateGroups, type GenerateResult } from '@/api/groups';
import { fetchFieldsOfStudy } from '@/api/fieldsOfStudy';
import { fetchSpecializations } from '@/api/specializations';
import { getErrorMessage } from '@/lib/errors';
import { GROUP_TYPE_LABELS, STUDY_MODES, STUDY_MODE_LABELS } from '@/lib/labels';
import type { StudyMode } from '@/types';

const NO_SPECIALIZATION = '__none__';

const generateSchema = z.object({
  fieldOfStudyId: z.string().min(1, 'Wybierz kierunek'),
  specializationId: z.string().optional(),
  studyYear: z.number().int().min(1, 'Rok od 1').max(6, 'Rok do 6'),
  studyMode: z.enum(STUDY_MODES as [StudyMode, ...StudyMode[]]),
  totalStudents: z.number({ message: 'Podaj liczbe' }).int().min(1, 'Musi byc wiecej niz 0'),
  exerciseGroupCount: z.number().int().min(1, 'Minimum 1').max(5, 'Maksimum 5'),
  labPerExercise: z.number().int().min(1, 'Minimum 1').max(8, 'Maksimum 8'),
});

type GenerateValues = z.infer<typeof generateSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYear: string;
  onSaved: () => void;
}

/**
 * Kreator grup w dwoch krokach: parametry -> podglad propozycji -> zapis.
 *
 * Rozdzielenie jest celowe: backend osobno liczy propozycje (POST /generate, nic nie
 * zapisuje) i osobno ja utrwala (POST /confirm). Dzieki temu widac, co powstanie,
 * zanim cokolwiek trafi do bazy.
 */
export function GenerateGroupsDialog({ open, onOpenChange, academicYear, onSaved }: Props) {
  const [result, setResult] = useState<GenerateResult | null>(null);

  const { data: fields } = useQuery({
    queryKey: ['fields-of-study'],
    queryFn: () => fetchFieldsOfStudy(),
  });
  const { data: specializations } = useQuery({
    queryKey: ['specializations'],
    queryFn: () => fetchSpecializations(),
  });

  const form = useForm<GenerateValues>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      fieldOfStudyId: '',
      specializationId: NO_SPECIALIZATION,
      studyYear: 1,
      studyMode: 'FULL_TIME',
      totalStudents: 60,
      exerciseGroupCount: 2,
      labPerExercise: 2,
    },
  });

  const selectedField = form.watch('fieldOfStudyId');
  const fieldSpecializations =
    specializations?.filter((spec) => spec.fieldOfStudyId === selectedField) ?? [];

  const generateMutation = useMutation({
    mutationFn: (values: GenerateValues) =>
      generateGroups({
        fieldOfStudyId: values.fieldOfStudyId,
        specializationId:
          values.specializationId === NO_SPECIALIZATION ? undefined : values.specializationId,
        studyYear: values.studyYear,
        academicYear,
        totalStudents: values.totalStudents,
        studyMode: values.studyMode,
        exerciseGroupCount: values.exerciseGroupCount,
        labPerExercise: values.labPerExercise,
      }),
    onSuccess: (data) => setResult(data),
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const values = form.getValues();
      return confirmGroups({
        fieldOfStudyId: values.fieldOfStudyId,
        specializationId:
          values.specializationId === NO_SPECIALIZATION ? undefined : values.specializationId,
        academicYear,
        studyMode: values.studyMode,
        proposal: result!.proposal,
      });
    },
    onSuccess: (groups) => {
      toast.success(`Zapisano ${groups.length} grup`);
      setResult(null);
      form.reset();
      onOpenChange(false);
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const close = (nextOpen: boolean) => {
    if (!nextOpen) setResult(null);
    onOpenChange(nextOpen);
  };

  const totalInProposal = result?.proposal.reduce((sum, item) => sum + item.size, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {result ? 'Propozycja grup' : 'Generuj grupy'}
          </DialogTitle>
          <DialogDescription>
            {result
              ? `Rok ${academicYear}, rok studiow ${result.meta.studyYear}. Nic nie jest jeszcze zapisane.`
              : 'Formy zajec (wyklad, cwiczenia, laboratorium…) backend odczyta z aktywnej siatki godzin.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{result.proposal.length} grup</Badge>
              <span>
                lacznie {totalInProposal} miejsc przy {result.meta.totalStudents} studentach
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nazwa</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Nadrzedna</TableHead>
                    <TableHead className="text-right">Liczebnosc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.proposal.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{GROUP_TYPE_LABELS[item.type]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.parentName ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.size}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <form
            id="generate-form"
            onSubmit={form.handleSubmit((values) => generateMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
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
                          // Specjalnosc nalezy do kierunku — po zmianie kierunku stara jest nieaktualna.
                          form.setValue('specializationId', NO_SPECIALIZATION);
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
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!selectedField}
                      >
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
                  <FieldDescription>Decyduje o przedrostku nazw grup.</FieldDescription>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="studyYear">Rok studiow</FieldLabel>
                  <Input
                    id="studyYear"
                    type="number"
                    min={1}
                    max={6}
                    aria-invalid={!!form.formState.errors.studyYear}
                    {...form.register('studyYear', { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.studyYear]} />
                </Field>

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
                  <FieldLabel htmlFor="totalStudents">Liczba studentow</FieldLabel>
                  <Input
                    id="totalStudents"
                    type="number"
                    min={1}
                    aria-invalid={!!form.formState.errors.totalStudents}
                    {...form.register('totalStudents', { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.totalStudents]} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="exerciseGroupCount">Grup cwiczeniowych</FieldLabel>
                  <Input
                    id="exerciseGroupCount"
                    type="number"
                    min={1}
                    max={5}
                    aria-invalid={!!form.formState.errors.exerciseGroupCount}
                    {...form.register('exerciseGroupCount', { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.exerciseGroupCount]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="labPerExercise">Podgrup lab. na cwiczenia</FieldLabel>
                  <Input
                    id="labPerExercise"
                    type="number"
                    min={1}
                    max={8}
                    aria-invalid={!!form.formState.errors.labPerExercise}
                    {...form.register('labPerExercise', { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.labPerExercise]} />
                </Field>
              </div>

              <Alert>
                <Sparkles />
                <AlertTitle>To dziekanat decyduje o podziale</AlertTitle>
                <AlertDescription>
                  Liczba grup nie jest wyliczana z pojemnosci sal — podajesz ja sam, bo znasz
                  realia lepiej niz sama pojemnosc najwiekszej sali.
                </AlertDescription>
              </Alert>
            </FieldGroup>
          </form>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={() => setResult(null)}>
                <ArrowLeft />
                Zmien parametry
              </Button>
              <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
                {confirmMutation.isPending && <Spinner />}
                Zapisz {result.proposal.length} grup
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Anuluj
              </Button>
              <Button type="submit" form="generate-form" disabled={generateMutation.isPending}>
                {generateMutation.isPending && <Spinner />}
                Pokaz propozycje
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
