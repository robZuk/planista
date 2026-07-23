import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Sparkles } from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { fetchTemplates, generateSemesterEntries, type GenerateResult } from '@/api/schedule';
import { fetchCalendars } from '@/api/schedule';
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
}

/**
 * Generator terminow: bierze wybrane wzorce tygodnia i rozpisuje je na konkretne
 * daty calego semestru. Zakres dat pochodzi z kalendarza semestru (jesli istnieje)
 * albo z domyslnego wyliczenia po stronie backendu.
 */
export function GenerateDialog({
  open,
  onOpenChange,
  academicYear,
  semesterType,
  studyMode,
}: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<GenerateResult | null>(null);

  const { data: templates, isPending } = useQuery({
    queryKey: ['templates', 'all', academicYear, studyMode],
    queryFn: () => fetchTemplates({ academicYear, studyMode }),
    enabled: open,
  });

  const { data: calendars } = useQuery({
    queryKey: ['calendars'],
    queryFn: fetchCalendars,
    enabled: open,
  });

  const calendar = calendars?.find(
    (item) =>
      item.academicYear === academicYear &&
      item.semesterType === semesterType &&
      item.studyMode === studyMode,
  );

  // Po otwarciu zaznaczamy wszystko — typowy scenariusz to "rozpisz caly semestr".
  useEffect(() => {
    if (open && templates) setSelected(new Set(templates.map((template) => template.id)));
    if (!open) setResult(null);
  }, [open, templates]);

  const generateMutation = useMutation({
    mutationFn: () =>
      generateSemesterEntries({
        templateIds: [...selected],
        academicYear,
        semesterType,
        studyMode,
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

        {result ? (
          <div className="space-y-3">
            <Alert>
              <CalendarCheck />
              <AlertTitle>Gotowe</AlertTitle>
              <AlertDescription>
                Generator pomija dni wolne, daty poza oknem trybu studiow i terminy, ktore juz
                istnieja.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Utworzone" value={result.created} highlight />
              <Stat label="Juz istnialy" value={result.alreadyExists} />
              <Stat label="Pominiete" value={result.skipped} />
              <Stat label="Konflikty" value={result.conflicts} warn={result.conflicts > 0} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {calendar ? (
              <p className="text-sm text-muted-foreground">
                Zakres semestru: {formatDateLong(calendar.startDate)} –{' '}
                {formatDateLong(calendar.endDate)} ({calendar.teachingWeeks} tygodni).
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

            {isPending ? (
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
                onClick={() => generateMutation.mutate()}
                disabled={selected.size === 0 || generateMutation.isPending}
              >
                {generateMutation.isPending && <Spinner />}
                Generuj z {selected.size} wzorcow
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
