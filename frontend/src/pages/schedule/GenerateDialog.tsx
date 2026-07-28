import { useEffect, useState } from 'react';
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
import { fetchFaculties } from '@/api/faculties';
import { useAuthStore } from '@/store/authStore';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import { CLASS_FULL_LABELS } from '@/lib/scheduleDisplay';
import { SEMESTER_TYPE_LABELS } from '@/lib/semester';
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
}: Props) {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickedFacultyId, setPickedFacultyId] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);

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

  const { data: templates, isPending } = useQuery({
    queryKey: ['templates', 'all', academicYear, studyMode, effectiveFacultyId ?? 'none'],
    queryFn: () => fetchTemplates({ academicYear, studyMode, facultyId: effectiveFacultyId! }),
    enabled: open && !deanNoFaculty && !!effectiveFacultyId,
  });

  const { data: calendars } = useQuery({
    queryKey: ['semester-calendars'],
    queryFn: fetchCalendars,
    enabled: open,
  });

  // Kalendarz wydzialowy ma pierwszenstwo nad ogolnouczelnianym (lustro
  // resolveSemesterRange z backendu).
  const matching = calendars?.filter(
    (item) =>
      item.academicYear === academicYear &&
      item.semesterType === semesterType &&
      item.studyMode === studyMode,
  );
  const calendar =
    matching?.find((item) => item.facultyId === effectiveFacultyId) ??
    matching?.find((item) => item.facultyId === null);

  // Ile terminow zniknie. Liczymy dopiero, gdy znamy wydzial i zakres dat.
  const from = calendar?.startDate.slice(0, 10);
  const to = calendar?.endDate.slice(0, 10);
  const { data: doomed } = useQuery({
    queryKey: ['schedule-entries', 'doomed', from, to, effectiveFacultyId],
    queryFn: () => fetchEntries({ from, to, facultyId: effectiveFacultyId! }),
    enabled: open && !!effectiveFacultyId && !!from && !!to && !result,
  });
  const doomedManual = doomed?.filter((entry) => entry.template === null).length ?? 0;

  // Po otwarciu zaznaczamy wszystko — typowy scenariusz to "rozpisz caly semestr".
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

  const allSelected = !!templates && templates.length > 0 && selected.size === templates.length;
  const canGenerate = selected.size > 0 && !!effectiveFacultyId && !deanNoFaculty;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generuj terminy semestru</DialogTitle>
          <DialogDescription>
            {SEMESTER_TYPE_LABELS[semesterType]} {academicYear} — wybrane wzorce zostana rozpisane
            na konkretne daty.
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
                {formatDateLong(calendar.endDate)} ({calendar.teachingWeeks} tygodni)
                {calendar.facultyId ? ' — kalendarz wydzialowy.' : ' — kalendarz ogolnouczelniany.'}
              </p>
            ) : (
              <Alert>
                <Sparkles />
                <AlertTitle>Brak zapisanego kalendarza semestru</AlertTitle>
                <AlertDescription>
                  Backend uzyje domyslnego zakresu dat dla tego roku i semestru.
                </AlertDescription>
              </Alert>
            )}

            {effectiveFacultyId && (doomed?.length ?? 0) > 0 && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Nadpisze caly kalendarz tego wydzialu</AlertTitle>
                <AlertDescription>
                  W zakresie semestru zniknie {doomed!.length} istniejacych terminow
                  {doomedManual > 0 ? `, w tym ${doomedManual} dodanych recznie` : ''}. Reczne
                  przeniesienia i odwolania nie przetrwaja tej operacji.
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
                Nie ma zadnych wzorcow dla tego roku i trybu — nie ma czego rozpisywac.
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
