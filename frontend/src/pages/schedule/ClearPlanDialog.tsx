import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  deleteSemesterEntries,
  deleteTemplates,
  fetchCalendars,
  fetchEntries,
  fetchTemplates,
} from '@/api/schedule';
import { fetchVersions } from '@/api/curriculum';
import { fetchFaculties } from '@/api/faculties';
import { useAuthStore } from '@/store/authStore';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import { SEMESTER_TYPE_LABELS, semesterTypeOf } from '@/lib/semester';
import {
  describeScope,
  isScoped,
  scopePayload,
  templateScopeParams,
  type PlanScope,
} from '@/lib/planScope';
import { STUDY_MODE_LABELS } from '@/lib/labels';
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
  /** Co zaznaczyc po otwarciu — zalezy od zakladki, z ktorej przyszlo klikniecie. */
  defaultTarget: 'templates' | 'entries';
}

/**
 * Kasowanie planu jednego wydzialu: wzorca tygodnia, kalendarza semestru albo obu.
 *
 * Oba poziomy sa rozdzielone, wiec kasuja sie niezaleznie: usuniecie wzorca nie
 * rusza juz rozpisanych terminow, a wyczyszczenie kalendarza nie rusza wzorca.
 * Jak przy generowaniu, operacja zawsze dotyczy dokladnie jednego wydzialu.
 */
export function ClearPlanDialog({
  open,
  onOpenChange,
  academicYear,
  semesterType,
  studyMode,
  facultyId,
  scope,
  defaultTarget,
}: Props) {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [clearTemplates, setClearTemplates] = useState(defaultTarget === 'templates');
  const [clearEntries, setClearEntries] = useState(defaultTarget === 'entries');
  const [pickedFacultyId, setPickedFacultyId] = useState('');

  // Dziekanat czysci wylacznie swoj wydzial. Admin z filtrem "wszystkie" musi wskazac
  // jeden — kasowanie planu calej uczelni jednym klikiem jest za szerokie.
  const isDeanOffice = me?.role === 'DEAN_OFFICE';
  const needsPick = !isDeanOffice && facultyId === 'all';
  const effectiveFacultyId = isDeanOffice
    ? (me?.facultyId ?? null)
    : needsPick
      ? pickedFacultyId || null
      : facultyId;
  const deanNoFaculty = isDeanOffice && !me?.facultyId;

  useEffect(() => {
    if (open) {
      setClearTemplates(defaultTarget === 'templates');
      setClearEntries(defaultTarget === 'entries');
    } else {
      setPickedFacultyId('');
    }
  }, [open, defaultTarget]);

  const { data: faculties } = useQuery({
    queryKey: ['faculties'],
    queryFn: fetchFaculties,
    enabled: open,
  });
  const facultyName = effectiveFacultyId
    ? (faculties?.find((f) => f.id === effectiveFacultyId)?.name ?? null)
    : null;

  // Kierunek i specjalnosc zaweza serwer (wzorzec nie niesie tych pol), semestr — klient.
  const { data: allTemplates, isPending: templatesPending } = useQuery({
    queryKey: [
      'templates',
      'all',
      academicYear,
      studyMode,
      effectiveFacultyId ?? 'none',
      scope.fieldOfStudyId,
      scope.specializationId,
    ],
    queryFn: () =>
      fetchTemplates({
        academicYear,
        studyMode,
        facultyId: effectiveFacultyId!,
        ...templateScopeParams(scope),
      }),
    enabled: open && !!effectiveFacultyId,
  });

  // Wzorzec tego semestru: pore liczymy z naboru KAZDEJ siatki osobno (semestr 1 bywa
  // letni), zeby czyszczenie zimy nie zabralo wzorcow letnich tego samego rocznika.
  const doomedTemplates = useMemo(
    () =>
      (allTemplates ?? []).filter(
        (template) =>
          semesterTypeOf(
            template.curriculumEntry.curriculumVersion.startSemesterType,
            template.semester,
          ) === semesterType &&
          (scope.semester === 'all' || template.semester === scope.semester),
      ),
    [allTemplates, semesterType, scope.semester],
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

  // Podglad, ile terminow zniknie. Bez zapisanego kalendarza nie znamy zakresu dat —
  // backend uzyje wtedy dat wyliczonych z roku, a my nie pokazujemy liczby.
  const from = calendar?.startDate.slice(0, 10);
  const to = calendar?.endDate.slice(0, 10);
  const { data: entriesInRange } = useQuery({
    queryKey: ['schedule-entries', 'doomed', from, to, effectiveFacultyId],
    queryFn: () => fetchEntries({ from, to, facultyId: effectiveFacultyId! }),
    enabled: open && !!effectiveFacultyId && !!from && !!to,
  });
  // Specjalnosc -> kierunek: termin niesie tylko specializationId, wiec zawezenie po
  // kierunku odwzorowujemy przez siatki.
  const { data: versions } = useQuery({
    queryKey: ['curriculum-versions'],
    queryFn: fetchVersions,
    enabled: open,
  });
  const fieldBySpecialization = useMemo(
    () =>
      new Map(
        (versions ?? [])
          .filter((version) => version.specialization)
          .map((version) => [version.specializationId, version.specialization!.fieldOfStudyId]),
      ),
    [versions],
  );

  // Nazwy do opisu zakresu.
  const specializationNames = useMemo(
    () =>
      new Map(
        (versions ?? [])
          .filter((version) => version.specialization)
          .map((version) => [version.specializationId, version.specialization!.name]),
      ),
    [versions],
  );
  const fields = useMemo(() => {
    const map = new Map<string, string>();
    for (const version of versions ?? []) {
      const field = version.specialization?.fieldOfStudy;
      if (field) map.set(field.id, field.name);
    }
    return map;
  }, [versions]);

  // Lustro zakresu kasowania z backendu: tryb studiow + zawezenie z paska filtrow. Plan
  // drugiego trybu i wszystko poza zakresem stoi na tych samych datach, ale zostaje.
  const doomedEntries = entriesInRange?.filter((entry) => {
    const version = entry.curriculumEntry.curriculumVersion;
    if (version.studyMode !== studyMode) return false;
    if (scope.specializationId !== 'all' && version.specializationId !== scope.specializationId) {
      return false;
    }
    if (
      scope.specializationId === 'all' &&
      scope.fieldOfStudyId !== 'all' &&
      fieldBySpecialization.get(version.specializationId) !== scope.fieldOfStudyId
    ) {
      return false;
    }
    if (scope.semester !== 'all' && entry.curriculumEntry.semester !== scope.semester) return false;
    return true;
  });
  const doomedManual = doomedEntries?.filter((entry) => entry.template === null).length ?? null;

  const clearMutation = useMutation({
    mutationFn: async () => {
      // Pusta lista id to dla backendu bledne zadanie, wiec przy zerze nie wolamy go wcale.
      const removedTemplates =
        clearTemplates && doomedTemplates.length > 0
          ? (await deleteTemplates(doomedTemplates.map((template) => template.id))).deleted
          : 0;
      // Kalendarz kasujemy po wzorcach — terminy i tak nie znikaja razem z wzorcem,
      // wiec kolejnosc nie zmienia wyniku, ale trzyma komunikat w jednym miejscu.
      const removedEntries = clearEntries
        ? (
            await deleteSemesterEntries({
              academicYear,
              semesterType,
              studyMode,
              facultyId: effectiveFacultyId!,
              // Ten sam zakres co przy generowaniu — kasujemy dokladnie to, co pokazal podglad.
              scope: scopePayload(scope),
            })
          ).deleted
        : null;
      return { removedTemplates, removedEntries };
    },
    onSuccess: ({ removedTemplates, removedEntries }) => {
      const parts: string[] = [];
      if (clearTemplates) parts.push(`wzorce: ${removedTemplates}`);
      if (clearEntries) parts.push(`terminy: ${removedEntries?.total ?? 0}`);
      toast.success(`Usunieto — ${parts.join(', ')}`);
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      void queryClient.invalidateQueries({ queryKey: ['schedule-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['coverage'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getScheduleErrorMessage(error)),
  });

  const scoped = isScoped(scope);
  const scopeLabel = describeScope(scope, {
    fieldName: fields.get(scope.fieldOfStudyId),
    specializationName: specializationNames.get(scope.specializationId),
  });

  const nothingPicked = !clearTemplates && !clearEntries;
  const canClear = !nothingPicked && !!effectiveFacultyId && !deanNoFaculty;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Usun plan semestru</DialogTitle>
          <DialogDescription>
            {SEMESTER_TYPE_LABELS[semesterType]} {academicYear} ·{' '}
            {STUDY_MODE_LABELS[studyMode].toLowerCase()} — wybierz, co ma zniknac.
          </DialogDescription>
        </DialogHeader>

        {deanNoFaculty ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Konto bez przypisanego wydzialu</AlertTitle>
            <AlertDescription>
              To konto dziekanatu nie ma przypisanego wydzialu — poinformuj administratora.
              Usuwanie jest wylaczone.
            </AlertDescription>
          </Alert>
        ) : needsPick ? (
          <div className="space-y-1.5">
            <span className="text-sm text-muted-foreground">Wydzial do wyczyszczenia</span>
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
              Usuwanie obejmuje jeden wydzial, wiec trzeba go wskazac.
            </p>
          </div>
        ) : (
          <p className="text-sm">
            <span className="text-muted-foreground">Czyscisz plan wydzialu: </span>
            <span className="font-medium">{facultyName ?? '…'}</span>
          </p>
        )}

        {/* Zakres bierzemy z paska filtrow widoku — okno go nie dubluje. */}
        {!deanNoFaculty && (
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
        )}

        {!deanNoFaculty && (
          <div className="space-y-3">
            <ItemGroup className="rounded-lg border">
              <Item size="sm" variant="muted" asChild>
                <label className="cursor-pointer">
                  <Checkbox
                    checked={clearTemplates}
                    onCheckedChange={(value) => setClearTemplates(value === true)}
                  />
                  <ItemContent>
                    <ItemTitle>Wzorzec tygodnia</ItemTitle>
                    <ItemDescription>
                      {!effectiveFacultyId
                        ? 'Wskaz wydzial, zeby policzyc wzorce.'
                        : templatesPending
                          ? 'Licze wzorce…'
                          : `${doomedTemplates.length} wzorcow tego semestru. Rozpisane terminy zostaja — tylko traca powiazanie z seria.`}
                    </ItemDescription>
                  </ItemContent>
                </label>
              </Item>

              <Item size="sm" variant="muted" asChild>
                <label className="cursor-pointer">
                  <Checkbox
                    checked={clearEntries}
                    onCheckedChange={(value) => setClearEntries(value === true)}
                  />
                  <ItemContent>
                    <ItemTitle>Kalendarz semestru</ItemTitle>
                    <ItemDescription>
                      {!effectiveFacultyId
                        ? 'Wskaz wydzial, zeby policzyc terminy.'
                        : calendar
                          ? `${doomedEntries?.length ?? 0} terminow z zakresu ${formatDateLong(calendar.startDate)} – ${formatDateLong(calendar.endDate)}. Wzorzec tygodnia zostaje.`
                          : 'Brak zapisanego kalendarza semestru — backend uzyje domyslnego zakresu dat dla tego roku.'}
                    </ItemDescription>
                  </ItemContent>
                </label>
              </Item>
            </ItemGroup>

            {clearEntries && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>
                  Kasuje {scoped ? scopeLabel : 'caly kalendarz tego wydzialu'} (
                  {STUDY_MODE_LABELS[studyMode].toLowerCase()})
                </AlertTitle>
                <AlertDescription>
                  Z zakresu semestru zniknie {doomedEntries?.length ?? 0} terminow
                  {doomedManual !== null && doomedManual > 0
                    ? `, w tym ${doomedManual} dodanych recznie`
                    : ''}
                  . Reczne przeniesienia i odwolania nie przetrwaja tej operacji. Plan drugiego
                  trybu z tych samych dat{scoped ? ' oraz to, co poza wybranym zakresem,' : ''}{' '}
                  zostaje — dokladnie tak, jak przy nadpisaniu przez generator.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button
            variant="destructive"
            onClick={() => clearMutation.mutate()}
            disabled={!canClear || clearMutation.isPending}
          >
            {clearMutation.isPending ? <Spinner /> : <Trash2 />}
            Usun bezpowrotnie
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
