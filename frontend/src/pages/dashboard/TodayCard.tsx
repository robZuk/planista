import { CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { CLASS_FULL_LABELS, STATUS_LABELS } from '@/lib/scheduleDisplay';
import type { ClassType, EntryStatus } from '@/types';

/**
 * Minimum, ktore karta potrzebuje. Dzieki temu przyjmuje zarowno DashboardEntry
 * (ze statystyk), jak i ScheduleEntry (z kalendarza) bez rzutowania typow.
 */
export interface TodayEntry {
  id: string;
  classType: ClassType;
  status: EntryStatus;
  room: { number: string; building: { name: string } };
  instructor: { firstName: string; lastName: string; title: string | null };
  studentGroup: { name: string } | null;
  curriculumEntry: { subject: { name: string } };
  startBlock: { order: number; startTime: string };
  endBlock: { endTime: string };
}

/** Lista dzisiejszych zajec — chronologicznie, z sala i prowadzacym. */
export function TodayCard({
  entries,
  loading,
  title = 'Dzisiejsze zajecia',
  emptyText = 'Dzis nie ma zadnych zajec.',
}: {
  entries: TodayEntry[] | undefined;
  loading?: boolean;
  title?: string;
  emptyText?: string;
}) {
  const sorted = [...(entries ?? [])].sort((a, b) => a.startBlock.order - b.startBlock.order);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>
          {new Date().toLocaleDateString('pl-PL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ItemGroup className="rounded-lg border">
            {sorted.map((entry) => (
              <Item key={entry.id} size="sm" variant="muted">
                <ItemContent>
                  <ItemTitle>
                    <span className="tabular-nums">
                      {entry.startBlock.startTime}–{entry.endBlock.endTime}
                    </span>
                    {entry.curriculumEntry.subject.name}
                    <Badge variant="outline">{CLASS_FULL_LABELS[entry.classType]}</Badge>
                    {entry.status !== 'SCHEDULED' && (
                      <Badge variant="secondary">{STATUS_LABELS[entry.status]}</Badge>
                    )}
                  </ItemTitle>
                  <ItemDescription>
                    {entry.room.building.name} · sala {entry.room.number} ·{' '}
                    {`${entry.instructor.title ?? ''} ${entry.instructor.firstName} ${entry.instructor.lastName}`.trim()}
                    {entry.studentGroup && ` · ${entry.studentGroup.name}`}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
