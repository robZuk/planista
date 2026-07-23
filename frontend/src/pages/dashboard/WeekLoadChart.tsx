import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { toDateKey } from '@/lib/scheduleDates';
import type { ScheduleEntry } from '@/types';

const WEEKDAYS = [
  { key: 1, label: 'Pn' },
  { key: 2, label: 'Wt' },
  { key: 3, label: 'Sr' },
  { key: 4, label: 'Cz' },
  { key: 5, label: 'Pt' },
  { key: 6, label: 'So' },
  { key: 0, label: 'Nd' },
];

// Jedna seria = jeden odcien. Wielkosc to magnituda, nie tozsamosc, wiec nie ma
// tu czego rozrozniac kolorem; legenda tez jest zbedna, bo tytul nazywa serie.
const config = {
  hours: { label: 'Godziny zajec', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** Rozklad godzin zajec na dni biezacego tygodnia. */
export function WeekLoadChart({
  entries,
  title = 'Obciazenie tygodnia',
  description,
}: {
  entries: ScheduleEntry[];
  title?: string;
  description?: string;
}) {
  const data = useMemo(() => {
    const byDay = new Map<number, number>();
    for (const entry of entries) {
      if (entry.status === 'CANCELLED') continue;
      // toDateKey + rozbior na czesci: unikamy przesuniecia dnia przez strefe czasowa.
      const [year, month, day] = toDateKey(entry.date).split('-').map(Number);
      const weekday = new Date(year!, month! - 1, day!).getDay();
      const hours = entry.endBlock.order - entry.startBlock.order + 1;
      byDay.set(weekday, (byDay.get(weekday) ?? 0) + hours);
    }
    return WEEKDAYS.map((day) => ({ day: day.label, hours: byDay.get(day.key) ?? 0 }));
  }, [entries]);

  const total = data.reduce((sum, item) => sum + item.hours, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ?? `Godziny zajec w podziale na dni — razem ${total} h w tym tygodniu.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            W tym tygodniu nie ma zadnych zajec.
          </p>
        ) : (
          <ChartContainer config={config} className="h-56 w-full">
            <BarChart accessibilityLayer data={data} margin={{ left: -20, right: 8 }}>
              {/* Siatka ma byc tlem, nie trescia — same poziome linie, bez pionowych. */}
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
              <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} cursor={false} />
              <Bar dataKey="hours" fill="var(--color-hours)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
