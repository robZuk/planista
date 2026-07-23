import { CalendarCheck, CalendarX, RotateCcw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  icon: LucideIcon;
}

/**
 * Rozklad terminow wg statusu jako jeden pasek proporcji.
 *
 * Nie jest to wykres kolowy ani slupkowy: trzy wartosci sumujace sie do calosci
 * czyta sie najlepiej jako jeden pasek. Kolory sa STATUSOWE (zarezerwowane),
 * wiec kazdemu segmentowi towarzyszy ikona, nazwa i liczba — sam kolor nigdy
 * nie niesie tu znaczenia.
 */
export function EntryStatusMeter({
  scheduled,
  cancelled,
  makeup,
}: {
  scheduled: number;
  cancelled: number;
  makeup: number;
}) {
  const segments: Segment[] = [
    {
      key: 'scheduled',
      label: 'Zaplanowane',
      value: scheduled,
      color: 'var(--status-scheduled)',
      icon: CalendarCheck,
    },
    {
      key: 'makeup',
      label: 'Odrobienia',
      value: makeup,
      color: 'var(--status-makeup)',
      icon: RotateCcw,
    },
    {
      key: 'cancelled',
      label: 'Odwolane',
      value: cancelled,
      color: 'var(--status-cancelled)',
      icon: CalendarX,
    },
  ];

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Terminy wg statusu</CardTitle>
        <CardDescription>
          {total > 0
            ? `${total} terminow w calym systemie.`
            : 'Nie ma jeszcze zadnych terminow.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {total > 0 && (
          // gap-0.5 = 2px przerwy miedzy segmentami: bez niej sasiadujace kolory
          // stykaja sie i granica ginie przy slabszym rozroznianiu barw.
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {segments
              .filter((segment) => segment.value > 0)
              .map((segment) => (
                <div
                  key={segment.key}
                  style={{
                    backgroundColor: segment.color,
                    width: `${(segment.value / total) * 100}%`,
                  }}
                  className="first:rounded-l-full last:rounded-r-full"
                />
              ))}
          </div>
        )}

        <ul className="space-y-2">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: segment.color }}
              />
              <segment.icon className="size-4 text-muted-foreground" />
              <span>{segment.label}</span>
              <span className="ml-auto font-medium tabular-nums">{segment.value}</span>
              <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                {total > 0 ? `${Math.round((segment.value / total) * 100)}%` : '—'}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
