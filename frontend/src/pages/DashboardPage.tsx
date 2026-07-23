import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  CalendarOff,
  Clock,
  GraduationCap,
  LayoutGrid,
  ShieldCheck,
  Table2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { PageHeader } from '@/components/PageHeader';
import { fetchDashboardStats } from '@/api/dashboard';
import { fetchEntries } from '@/api/schedule';
import { ROLE_LABELS } from '@/lib/navigation';
import { addDays, formatDateLong, startOfWeek, toDateKey } from '@/lib/scheduleDates';
import { useAuthStore } from '@/store/authStore';
import { StatTile } from './dashboard/StatTile';
import { WeekLoadChart } from './dashboard/WeekLoadChart';
import { EntryStatusMeter } from './dashboard/EntryStatusMeter';
import { TodayCard } from './dashboard/TodayCard';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  const monday = startOfWeek(new Date());
  const from = toDateKey(monday);
  const to = toDateKey(addDays(monday, 6));

  const { data: stats, isPending } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  });

  /**
   * Endpoint /dashboard/stats zwraca dane CALEJ uczelni, niezaleznie od roli.
   * Dla prowadzacego i studenta pobieramy wiec osobno ich wlasny tydzien —
   * inaczej "moje zajecia" pokazywalyby cudze.
   */
  const myInstructorId = role === 'INSTRUCTOR' ? user?.instructorId : null;
  const myGroupIds = role === 'STUDENT' ? (user?.studentGroups.map((g) => g.id) ?? []) : [];
  const hasOwnPlan = !!myInstructorId || myGroupIds.length > 0;

  const { data: weekEntries } = useQuery({
    queryKey: ['schedule-entries', from, to, myInstructorId, myGroupIds],
    queryFn: async () => {
      if (myInstructorId) return fetchEntries({ from, to, instructorId: myInstructorId });

      if (myGroupIds.length > 0) {
        // Student nalezy zwykle do kilku grup naraz (wykladowa + cwiczeniowa +
        // laboratoryjna), a backend filtruje po JEDNEJ grupie. Pytamy wiec o kazda
        // osobno i scalamy, odsiewajac powtorzenia po id.
        const perGroup = await Promise.all(
          myGroupIds.map((groupId) => fetchEntries({ from, to, studentGroupId: groupId })),
        );
        const byId = new Map(perGroup.flat().map((entry) => [entry.id, entry]));
        return [...byId.values()];
      }

      return fetchEntries({ from, to });
    },
  });

  const todayKey = toDateKey(new Date());
  const myToday = weekEntries?.filter((entry) => toDateKey(entry.date) === todayKey) ?? [];

  const greeting = `${ROLE_LABELS[role ?? 'STUDENT']} · ${formatDateLong(new Date())}`;

  // ─── Prowadzacy i student: wlasny plan, bez statystyk calej uczelni ───
  if (role === 'INSTRUCTOR' || role === 'STUDENT') {
    const isInstructor = role === 'INSTRUCTOR';
    const weekHours = (weekEntries ?? [])
      .filter((entry) => entry.status !== 'CANCELLED')
      .reduce((sum, entry) => sum + (entry.endBlock.order - entry.startBlock.order + 1), 0);

    return (
      <>
        <PageHeader title={`Witaj, ${user?.name ?? ''}`} description={greeting} />

        {!hasOwnPlan && (
          <Card>
            <CardHeader>
              <CardTitle>Brak powiazania z planem</CardTitle>
              <CardDescription>
                {isInstructor
                  ? 'To konto nie jest powiazane z zadnym prowadzacym, wiec nie ma czego pokazac. Administrator moze to ustawic w Uzytkownikach.'
                  : 'To konto nie jest przypisane do zadnej grupy studenckiej. Administrator moze to ustawic w Uzytkownikach.'}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            label="Zajec dzisiaj"
            value={myToday.length}
            icon={CalendarDays}
            loading={!weekEntries}
          />
          <StatTile
            label="Godzin w tym tygodniu"
            value={weekHours}
            icon={Clock}
            loading={!weekEntries}
          />
          <StatTile
            label="Zajec w tym tygodniu"
            value={weekEntries?.length ?? 0}
            icon={LayoutGrid}
            loading={!weekEntries}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <WeekLoadChart
            entries={weekEntries ?? []}
            title="Twoj tydzien"
            description="Godziny zajec w podziale na dni biezacego tygodnia."
          />
          <TodayCard
            entries={myToday}
            loading={!weekEntries}
            title={isInstructor ? 'Twoje dzisiejsze zajecia' : 'Dzis w planie grupy'}
            emptyText="Dzis nie masz zajec."
          />
        </div>

        <Button variant="outline" asChild className="w-fit">
          <Link to="/schedule">
            <CalendarDays />
            Zobacz caly plan
          </Link>
        </Button>
      </>
    );
  }

  // ─── Administrator i dziekanat: obraz calej uczelni ───
  const isAdmin = role === 'ADMIN';

  return (
    <>
      <PageHeader title={`Witaj, ${user?.name ?? ''}`} description={greeting} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {isAdmin && (
          <StatTile
            label="Uzytkownicy"
            value={stats?.users.total ?? 0}
            hint={
              stats
                ? `${stats.users.byRole.INSTRUCTOR} prowadzacych, ${stats.users.byRole.STUDENT} studentow`
                : undefined
            }
            icon={ShieldCheck}
            loading={isPending}
          />
        )}
        <StatTile
          label="Prowadzacy"
          value={stats?.instructors.total ?? 0}
          icon={GraduationCap}
          loading={isPending}
        />
        <StatTile
          label="Grupy"
          value={stats?.groups.total ?? 0}
          hint={stats ? `${stats.students.total} studentow` : undefined}
          icon={Users}
          loading={isPending}
        />
        <StatTile
          label="Sale"
          value={stats?.rooms.total ?? 0}
          hint={stats ? `w ${stats.buildings.total} budynkach` : undefined}
          icon={Building2}
          loading={isPending}
        />
        <StatTile
          label="Wzorce tygodnia"
          value={stats?.templates.total ?? 0}
          icon={Table2}
          loading={isPending}
        />
        <StatTile
          label="Terminy"
          value={stats?.entries.total ?? 0}
          hint={stats ? `${stats.entries.todayCount} dzisiaj` : undefined}
          icon={CalendarDays}
          loading={isPending}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeekLoadChart entries={weekEntries ?? []} />
        <EntryStatusMeter
          scheduled={stats?.entries.scheduled ?? 0}
          cancelled={stats?.entries.cancelled ?? 0}
          makeup={stats?.entries.makeup ?? 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TodayCard entries={stats?.todayEntries} loading={isPending} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarOff className="size-4 text-muted-foreground" />
              Najblizsze dni wolne
            </CardTitle>
            <CardDescription>Generator terminow omija te daty.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.upcomingHolidays.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nie ma zaplanowanych dni wolnych.
              </p>
            ) : (
              <ItemGroup className="rounded-lg border">
                {stats?.upcomingHolidays.map((holiday) => (
                  <Item key={holiday.id} size="sm" variant="muted">
                    <ItemContent>
                      <ItemTitle>{holiday.name}</ItemTitle>
                      <ItemDescription>{formatDateLong(holiday.date)}</ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Ostatnio dodani uzytkownicy</CardTitle>
            <CardDescription>Pieciu najnowszych.</CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup className="rounded-lg border">
              {stats?.recentUsers.map((recent) => (
                <Item key={recent.id} size="sm" variant="muted">
                  <ItemContent>
                    <ItemTitle>
                      {recent.name}
                      <Badge variant="secondary">{ROLE_LABELS[recent.role]}</Badge>
                    </ItemTitle>
                    <ItemDescription>{recent.email}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      )}
    </>
  );
}
