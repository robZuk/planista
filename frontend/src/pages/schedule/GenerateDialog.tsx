import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  fetchCalendars,
  fetchEntries,
  fetchTemplates,
  generateSemesterEntries,
  type GenerateResult,
} from '@/api/schedule';
import { fetchVersions } from '@/api/curriculum';
import { fetchFaculties } from '@/api/faculties';
import { useAuthStore } from '@/store/authStore';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import { CLASS_FULL_LABELS } from '@/lib/scheduleDisplay';
import { STUDY_MODE_LABELS } from '@/lib/labels';
import { SEMESTER_TYPE_LABELS, semesterTypeOf } from '@/lib/semester';
import {
  describeScope,
  isScoped,
  scopePayload,
  templateScopeParams,
  type PlanScope,
} from '@/lib/planScope';
import { formatDateLong } from '@/lib/scheduleDates';
import type { SemesterType, StudyMode } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYear: string;
  semesterType: SemesterType;
  studyMode: StudyMode;
  /** Kontekst wydzialu z widoku: 'all' = wszystkie. Dla dziekanatu i tak wymuszamy jego wlasny. */
  facultyId: string;
  /** Kierunek / specjalnosc / semestr z paska filtrow widoku — patrz lib/planScope.ts. */
  scope: PlanScope;
}

/**
 * Generator terminow: bierze wybrane wzorce tygodnia i rozpisuje je na konkretne
 * daty calego semestru.
 *
 * Operacja jest DESTRUKCYJNA — nadpisuje kalendarz wybranego wydzialu w calosci,
 * kasujac takze terminy dodane recznie i przeniesienia. Dlatego zawsze dotyczy
 * dokladnie jednego wydzialu, takze gdy admin oglada "wszystkie".
 */
export function GenerateDialog({
  open,
  onOpenChange,
  academicYear,
  semesterType,
  studyMode,
  facultyId,
  scope,
}: Props) {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickedFacultyId, setPickedFacultyId] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);

  const { fieldOfStudyId, specializationId, semester } = scope;

  // Dziekanat generuje wylacznie swoj wydzial. Admin z filtrem "wszystkie" musi
  // wskazac jeden — nadpisanie kalendarzy calej uczelni jednym klikiem jest za szerokie.
  const isDeanOffice = me?.role === 'DEAN_OFFICE';
  const needsPick = !isDeanOffice && facultyId === 'all';
  const effectiveFacultyId = isDeanOffice
    ? (me?.facultyId ?? null)
    : needsPick
      ? pickedFacultyId || null
      : facultyId;
  // Konto dziekanatu bez przypisanego wydzialu — nie ma czego (bezpiecznie) rozpisac.
  const deanNoFaculty = isDeanOffice && !me?.facultyId;

  const { data: faculties } = useQuery({
    queryKey: ['faculties'],
    queryFn: fetchFaculties,
    enabled: open,
  });
  const facultyName = effectiveFacultyId
    ? (faculties?.find((f) => f.id === effectiveFacultyId)?.name ?? null)
    : null;

  // Kierunek i specjalnosc zawezamy po stronie serwera (wzorzec nie niesie tych pol),
  // pore semestru i numer — po stronie klienta.
  const curriculumFilter = templateScopeParams(scope);

  const { data: allTemplates, isPending } = useQuery({
    queryKey: [
      'templates',
      'all',
      academicYear,
      studyMode,
      effectiveFacultyId ?? 'none',
      fieldOfStudyId,
      specializationId,
    ],
    queryFn: () =>
      fetchTemplates({
        academicYear,
        studyMode,
        facultyId: effectiveFacultyId!,
        ...curriculumFilter,
      }),
    enabled: open && !deanNoFaculty && !!effectiveFacultyId,
  });

  // Siatki tego roku, trybu i wydzialu — z nich bierzemy nazwy kierunkow i specjalnosci.
  const { data: versions } = useQuery({
    queryKey: ['curriculum-versions'],
    queryFn: fetchVersions,
    enabled: open,
  });
  const scopeVersions = useMemo(
    () =>
      versions?.filter(
        (version) =>
          version.academicYear === academicYear &&
          version.studyMode === studyMode &&
          (!effectiveFacultyId ||
            version.specialization?.fieldOfStudy?.faculty?.id === effectiveFacultyId),
      ) ?? [],
    [versions, academicYear, studyMode, effectiveFacultyId],
  );

  const fields = useMemo(() => {
    const map = new Map<string, string>();
    for (const version of scopeVersions) {
      const field = version.specialization?.fieldOfStudy;
      if (field) map.set(field.id, field.name);
    }
    return [...map].map(([id, name]) => ({ id, name }));
  }, [scopeVersions]);

  const specializations = useMemo(() => {
    const map = new Map<string, string>();
    for (const version of scopeVersions) {
      const spec = version.specialization;
      if (!spec) continue;
      if (fieldOfStudyId !== 'all' && spec.fieldOfStudyId !== fieldOfStudyId) continue;
      map.set(spec.id, spec.name);
    }
    return [...map].map(([id, name]) => ({ id, name }));
  }, [scopeVersions, fieldOfStudyId]);

  // API filtruje po roku i trybie, ale nie po PORZE semestru — a rozpisujemy na zakres dat
  // jednego semestru. Bez tego wzorce letnie (np. sem. 2) trafialy do listy zimowej i byly
  // domyslnie zaznaczone, wiec generator rozpisywal je na daty zimy. Pore liczymy z naboru
  // kazdej siatki osobno, bo semestr 1 bywa letni — tak samo jak ClearPlanDialog.
  const inSemesterType = useMemo(
    () =>
      allTemplates?.filter(
        (template) =>
          semesterTypeOf(
            template.curriculumEntry.curriculumVersion.startSemesterType,
            template.semester,
          ) === semesterType,
      ),
    [allTemplates, semesterType],
  );

  const templates = useMemo(
    () =>
      semester === 'all'
        ? inSemesterType
        : inSemesterType?.filter((template) => template.semester === semester),
    [inSemesterType, semester],
  );

  const { data: calendars } = useQuery({
    queryKey: ['semester-calendars'],
    queryFn: fetchCalendars,
    enabled: open,
  });

  // Kalendarz nalezy do wydzialu; jego brak oznacza daty wyliczone z roku (lustro
  // resolveSemesterRange z backendu).
  const calendar = calendars?.find(
    (item) =>
      item.academicYear === academicYear &&
      item.semesterType === semesterType &&
      item.studyMode === studyMode &&
      item.facultyId === effectiveFacultyId,
  );

  // Ile terminow zniknie. Liczymy dopiero, gdy znamy wydzial i zakres dat.
  const from = calendar?.startDate.slice(0, 10);
  const to = calendar?.endDate.slice(0, 10);
  const { data: entriesInRange } = useQuery({
    queryKey: ['schedule-entries', 'doomed', from, to, effectiveFacultyId],
    queryFn: () => fetchEntries({ from, to, facultyId: effectiveFacultyId! }),
    enabled: open && !!effectiveFacultyId && !!from && !!to && !result,
  });
  // Specjalnosc -> kierunek, zeby podglad umial odwzorowac zawezenie po kierunku
  // (termin niesie tylko specializationId).
  const fieldBySpecialization = useMemo(
    () =>
      new Map(
        scopeVersions
          .filter((version) => version.specialization)
          .map((version) => [version.specializationId, version.specialization!.fieldOfStudyId]),
      ),
    [scopeVersions],
  );

  // Lustro zakresu kasowania z generatora: tryb studiow + to samo zawezenie, ktore idzie
  // jako `scope`. Terminy poza zakresem zostaja na miejscu i nie licza sie do podgladu.
  const doomed = entriesInRange?.filter((entry) => {
    const version = entry.curriculumEntry.curriculumVersion;
    if (version.studyMode !== studyMode) return false;
    if (specializationId !== 'all' && version.specializationId !== specializationId) return false;
    if (
      specializationId === 'all' &&
      fieldOfStudyId !== 'all' &&
      fieldBySpecialization.get(version.specializationId) !== fieldOfStudyId
    ) {
      return false;
    }
    if (semester !== 'all' && entry.curriculumEntry.semester !== semester) return false;
    return true;
  });
  const doomedManual = doomed?.filter((entry) => entry.template === null).length ?? 0;

  // Po otwarciu (i po kazdej zmianie zawezenia) zaznaczamy wszystko z zakresu — typowy
  // scenariusz to "rozpisz cale to, co widze", a checkboxy sluza do wyjatkow.
  useEffect(() => {
    if (open && templates) setSelected(new Set(templates.map((template) => template.id)));
    if (!open) {
      setResult(null);
      setPickedFacultyId('');
    }
  }, [open, templates]);

  const generateMutation = useMutation({
    mutationFn: () =>
      generateSemesterEntries({
        templateIds: [...selected],
        academicYear,
        semesterType,
        studyMode,
        facultyId: effectiveFacultyId!,
        // Ten sam zakres wyznacza kasowanie po stronie serwera — bez niego rozpisanie
        // jednego semestru skasowaloby plan calego wydzialu.
        scope: scopePayload(scope),
      }),
    onSuccess: (response) => {
      setResult(response.data);
      toast.success(response.message ?? 'Terminy wygenerowane');
      void queryClient.invalidateQueries({ queryKey: ['schedule-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['coverage'] });
    },
    onError: (error) => toast.error(getScheduleErrorMessage(error)),
  });

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Opis zakresu mowi wprost, co wchodzi pod noz — przy zawezeniu "caly kalendarz
  // wydzialu" byloby nieprawda.
  const scoped = isScoped(scope);
  const scopeLabel = describeScope(scope, {
    fieldName: fields.find((f) => f.id === fieldOfStudyId)?.name,
    specializationName: specializations.find((s) => s.id === specializationId)?.name,
  });

  const allSelected = !!templates && templates.length > 0 && selected.size === templates.length;
  const canGenerate = selected.size > 0 && !!effectiveFacultyId && !deanNoFaculty;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generuj terminy semestru</DialogTitle>
          <DialogDescription>
            {SEMESTER_TYPE_LABELS[semesterType]} {academicYear} ·{' '}
            {STUDY_MODE_LABELS[studyMode].toLowerCase()} — wybrane wzorce zostana rozpisane na
            konkretne daty.
          </DialogDescription>
        </DialogHeader>

        {deanNoFaculty ? (
          <Alert variant="destructive">
            <Sparkles />
            <AlertTitle>Konto bez przypisanego wydzialu</AlertTitle>
            <AlertDescription>
              To konto dziekanatu nie ma przypisanego wydzialu — poinformuj administratora.
              Generowanie jest wylaczone.
            </AlertDescription>
          </Alert>
        ) : needsPick ? (
          <div className="space-y-1.5">
            <span className="text-sm text-muted-foreground">Wydzial do rozpisania</span>
            <Select value={pickedFacultyId} onValueChange={setPickedFacultyId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Wybierz wydzial…" />
              </SelectTrigger>
              <SelectContent>
                {faculties?.map((faculty) => (
                  <SelectItem key={faculty.id} value={faculty.id}>
                    {faculty.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Generowanie nadpisuje kalendarz jednego wydzialu, wiec trzeba go wskazac.
            </p>
          </div>
        ) : (
          <p className="text-sm">
            <span className="text-muted-foreground">Generujesz dla: </span>
            <span className="font-medium">{facultyName ?? '…'}</span>
          </p>
        )}

        {deanNoFaculty ? null : result ? (
          <div className="space-y-3">
            <Alert>
              <CalendarCheck />
              <AlertTitle>Gotowe</AlertTitle>
              <AlertDescription>
                Kalendarz wydzialu zostal rozpisany od nowa. Generator pomija dni wolne, daty poza
                oknem trybu studiow i terminy przekraczajace limit godzin z siatki.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Utworzone" value={result.created} highlight />
              <Stat label="Skasowane" value={result.deleted.total} warn={result.deleted.manual > 0} />
              <Stat label="Pominiete" value={result.skipped} />
              <Stat label="Konflikty" value={result.conflicts} warn={result.conflicts > 0} />
            </div>

            {result.deleted.manual > 0 && (
              <p className="text-xs text-muted-foreground">
                Wsrod skasowanych bylo {result.deleted.manual} terminow dodanych recznie
                (odrobienia, przeniesienia). Trzeba je wprowadzic ponownie.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {calendar ? (
              <p className="text-sm text-muted-foreground">
                Zakres semestru: {formatDateLong(calendar.startDate)} –{' '}
                {formatDateLong(calendar.endDate)} ({calendar.teachingWeeks} tygodni) — kalendarz
                wydzialu.
              </p>
            ) : (
              // Kalendarz szukamy po wydziale, wiec przed jego wskazaniem po prostu go nie
              // znamy — "brak kalendarza" byloby wtedy falszywym alarmem.
              effectiveFacultyId && (
                <Alert>
                  <Sparkles />
                  <AlertTitle>Brak zapisanego kalendarza semestru</AlertTitle>
                  <AlertDescription>
                    Backend uzyje domyslnego zakresu dat dla tego roku i semestru.
                  </AlertDescription>
                </Alert>
              )
            )}

            {/* Zakres bierzemy z paska filtrow widoku — okno go nie dubluje. Nie jest to
                filtr listy: ta sama trojka wyznacza, co zostanie skasowane przed rozpisaniem. */}
            <p className="text-sm">
              <span className="text-muted-foreground">Zakres: </span>
              <span className="font-medium">{scopeLabel}</span>
              {!scoped && (
                <span className="text-muted-foreground">
                  {' '}
                  — zawezisz go filtrami kierunku, specjalnosci i semestru nad planem.
                </span>
              )}
            </p>

            {effectiveFacultyId && (doomed?.length ?? 0) > 0 && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>
                  Nadpisze {scoped ? scopeLabel : 'kalendarz tego wydzialu'} (
                  {STUDY_MODE_LABELS[studyMode].toLowerCase()})
                </AlertTitle>
                <AlertDescription>
                  W zakresie semestru zniknie {doomed!.length} istniejacych terminow
                  {doomedManual > 0 ? `, w tym ${doomedManual} dodanych recznie` : ''}. Reczne
                  przeniesienia i odwolania nie przetrwaja tej operacji. Plan drugiego trybu
                  studiow{scoped ? ' oraz to, co poza wybranym zakresem,' : ''} zostaje
                  nietkniety.
                </AlertDescription>
              </Alert>
            )}

            {!effectiveFacultyId ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Wskaz wydzial, zeby zobaczyc jego wzorce.
              </p>
            ) : isPending ? (
              <p className="text-sm text-muted-foreground">Wczytuje wzorce…</p>
            ) : templates?.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                {scoped
                  ? 'Brak wzorcow w wybranym zakresie — poszerz filtry nad planem albo ulozy wzorzec tygodnia.'
                  : 'Nie ma zadnych wzorcow dla tego roku, semestru i trybu — nie ma czego rozpisywac.'}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Zaznaczono {selected.size} z {templates?.length ?? 0}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelected(allSelected ? new Set() : new Set(templates!.map((t) => t.id)))
                    }
                  >
                    {allSelected ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                  </Button>
                </div>

                <ItemGroup className="max-h-72 overflow-y-auto rounded-lg border">
                  {templates?.map((template) => (
                    <Item key={template.id} size="sm" variant="muted" asChild>
                      <label className="cursor-pointer">
                        <Checkbox
                          checked={selected.has(template.id)}
                          onCheckedChange={() => toggle(template.id)}
                        />
                        <ItemContent>
                          <ItemTitle>
                            {template.curriculumEntry.subject.name}
                            <Badge variant="outline">
                              {CLASS_FULL_LABELS[template.classType]}
                            </Badge>
                          </ItemTitle>
                          <span className="text-xs text-muted-foreground">
                            sem. {template.semester} · {template.startBlock.startTime}–
                            {template.endBlock.endTime} · sala {template.room.number}
                            {template.studentGroup && ` · ${template.studentGroup.name}`}
                          </span>
                        </ItemContent>
                      </label>
                    </Item>
                  ))}
                </ItemGroup>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Zamknij</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Anuluj
              </Button>
              <Button
                variant={(doomed?.length ?? 0) > 0 ? 'destructive' : 'default'}
                onClick={() => generateMutation.mutate()}
                disabled={!canGenerate || generateMutation.isPending}
              >
                {generateMutation.isPending && <Spinner />}
                {(doomed?.length ?? 0) > 0
                  ? `Nadpisz z ${selected.size} wzorcow`
                  : `Generuj z ${selected.size} wzorcow`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div
        className={
          warn
            ? 'text-2xl font-semibold tabular-nums text-destructive'
            : highlight
              ? 'text-2xl font-semibold tabular-nums text-primary'
              : 'text-2xl font-semibold tabular-nums'
        }
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
