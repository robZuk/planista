import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchCoverageSummary } from '@/api/schedule';
import { CLASS_FULL_LABELS } from '@/lib/scheduleDisplay';

/**
 * Bilans pokrycia: ile godzin z siatki ma juz KONKRETNE terminy w kalendarzu.
 *
 * Uwaga: backend liczy tu wylacznie wygenerowane wpisy (scheduleEntries), a nie
 * same wzorce — dopoki nie wygenerujesz semestru, licznik stoi na zerze mimo
 * ulozonego wzorca tygodnia. Dlatego naglowek mowi wprost, co jest liczone.
 */
export function CoverageCard({
  curriculumVersionId,
  semester,
}: {
  curriculumVersionId: string;
  semester: number;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['coverage', curriculumVersionId],
    queryFn: () => fetchCoverageSummary(curriculumVersionId),
    enabled: !!curriculumVersionId,
  });

  if (isPending) return <Skeleton className="h-12 w-full rounded-lg" />;
  // Pusta siatka zwraca 404 — brak bilansu nie jest bledem wartym alarmowania.
  if (isError || !data) return null;

  const current = data.semesters.find((item) => item.semester === semester);
  if (!current || current.subjects.length === 0) return null;

  const planned = current.subjects.reduce((sum, subject) => sum + subject.planned, 0);
  const required = current.subjects.reduce((sum, subject) => sum + subject.required, 0);
  const percent = required > 0 ? Math.round((planned / required) * 100) : 0;
  const done = current.subjects.filter((subject) => subject.completed).length;

  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-4 px-4 py-3">
          <span className="font-medium">Zrealizowane terminy</span>
          <Progress value={percent} className="h-2 max-w-48" />
          <span className="text-sm tabular-nums text-muted-foreground">
            {planned} / {required} h ({percent}%)
          </span>
          <Badge variant={done === current.subjects.length ? 'default' : 'secondary'}>
            {done} / {current.subjects.length} kompletnych
          </Badge>
          <ChevronDown className="ml-auto size-4 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-2 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Licznik pokazuje godziny z wygenerowanego kalendarza semestru. Sam wzorzec tygodnia go
          jeszcze nie podbija — zrobi to dopiero generator terminow.
        </p>
        {current.subjects.map((subject) => (
          <div
            key={`${subject.subjectName}-${subject.classType}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
          >
            {subject.completed ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <span className="size-4" />
            )}
            <span className="font-medium">{subject.subjectName}</span>
            <Badge variant="outline">{CLASS_FULL_LABELS[subject.classType]}</Badge>
            <span className="tabular-nums text-muted-foreground">
              {subject.planned} / {subject.required} h
            </span>
            {subject.remaining > 0 && (
              <span className="text-muted-foreground">— zostalo {subject.remaining} h</span>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
