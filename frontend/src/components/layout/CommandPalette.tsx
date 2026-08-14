import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import {
  BookMarked,
  Building2,
  GraduationCap,
  Landmark,
  Layers,
  LogOut,
  Moon,
  Search,
  Sun,
  Undo2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { logoutRequest } from '@/api/auth';
import { fetchInstructors } from '@/api/instructors';
import { fetchSubjects } from '@/api/subjects';
import { fetchBuildings } from '@/api/buildings';
import { fetchFaculties } from '@/api/faculties';
import { fetchFieldsOfStudy } from '@/api/fieldsOfStudy';
import { fetchSpecializations } from '@/api/specializations';
import { visibleGroups } from '@/lib/navigation';
import { useAuthStore } from '@/store/authStore';

/** Ile wynikow danych pokazac na grupe (paleta ma byc skrotem, nie tabela). */
const MAX_RESULTS = 6;

/**
 * Paleta polecen (Ctrl+K / ⌘K) — szybkie przejscie do dowolnej strony bez siegania
 * do menu. Lista pozycji pochodzi z [[navigation]], wiec zawsze pokazuje dokladnie
 * to, co dana rola widzi w sidebarze.
 *
 * Komponent renderuje takze przycisk w naglowku: skrot klawiszowy, o ktorym nikt
 * nie wie, jest bezuzyteczny.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();

  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const originalAuth = useAuthStore((s) => s.originalAuth);
  const stopImpersonating = useAuthStore((s) => s.stopImpersonating);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const groups = visibleGroups(user?.role);

  // Dane do wyszukiwania — pobierane dopiero gdy paleta otwarta (enabled: open),
  // wiec nic nie laduje sie w tle. Klucze te same co na stronach zasobow, wiec
  // korzystamy ze wspolnego cache TanStack Query.
  const { data: instructors = [] } = useQuery({
    queryKey: ['instructors'],
    queryFn: fetchInstructors,
    enabled: open,
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => fetchSubjects(),
    enabled: open,
  });
  const { data: buildings = [] } = useQuery({
    queryKey: ['buildings'],
    queryFn: fetchBuildings,
    enabled: open,
  });
  const { data: faculties = [] } = useQuery({
    queryKey: ['faculties'],
    queryFn: fetchFaculties,
    enabled: open,
  });
  const { data: fields = [] } = useQuery({
    queryKey: ['fields-of-study'],
    queryFn: () => fetchFieldsOfStudy(),
    enabled: open,
  });
  const { data: specializations = [] } = useQuery({
    queryKey: ['specializations'],
    queryFn: () => fetchSpecializations(),
    enabled: open,
  });

  // Wyniki danych pokazujemy dopiero od 2 znakow — inaczej po otwarciu palety
  // wysypaloby sie kilkaset pozycji. Filtrujemy po podciagu i tniemy do MAX_RESULTS.
  const q = search.trim().toLowerCase();
  const showData = q.length >= 2;
  const pick = <T,>(items: T[], text: (item: T) => string) =>
    showData ? items.filter((item) => text(item).toLowerCase().includes(q)).slice(0, MAX_RESULTS) : [];

  const instructorHits = pick(instructors, (i) => `${i.firstName} ${i.lastName} ${i.email}`);
  const subjectHits = pick(subjects, (s) => `${s.name} ${s.code ?? ''}`);
  const roomHits = pick(
    buildings.flatMap((b) => (b.rooms ?? []).map((r) => ({ ...r, buildingName: b.name }))),
    (r) => `${r.number} ${r.buildingName}`,
  );
  const facultyHits = pick(faculties, (f) => f.name);
  const fieldHits = pick(fields, (f) => f.name);
  const specializationHits = pick(specializations, (s) => s.name);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        // Bez preventDefault Chrome zabralby skrot na wlasna wyszukiwarke.
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Dialog nie odmontowuje zawartosci przy zamknieciu, wiec stare zapytanie
  // zostaloby w polu przy nastepnym otwarciu — czyscimy je sami.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  /** Kazda akcja z palety najpierw ja zamyka — inaczej dialog zostaje nad nowa strona. */
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const onLogout = async () => {
    try {
      if (refreshToken) await logoutRequest(refreshToken);
    } catch {
      // Sesje lokalna czyscimy nawet gdy uniewaznienie po stronie serwera padnie.
    } finally {
      clearAuth();
      queryClient.clear();
      navigate('/login', { replace: true });
      toast.success('Wylogowano');
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="text-muted-foreground w-full max-w-56 justify-start font-normal"
        onClick={() => setOpen(true)}
      >
        <Search />
        <span className="hidden sm:inline">Szukaj…</span>
        <KbdGroup className="ml-auto hidden sm:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Paleta polecen"
        description="Przejdz do strony lub wykonaj akcje"
      >
        {/* CommandDialog w shadcn v4 daje samo okno — kontekst cmdk trzeba
            zalozyc samemu, inaczej CommandInput wywala cala aplikacje. */}
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Szukaj strony, prowadzacego, przedmiotu, sali, wydzialu, kierunku…"
          />
          <CommandList>
            <CommandEmpty>Nic nie pasuje do tego zapytania.</CommandEmpty>

            {groups.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.to}
                    // Slowa kluczowe wpadaja do wartosci, wiec "dashboard" trafia
                    // w "Panel glowny", a "swieta" w "Dni wolne".
                    value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                    onSelect={() => run(() => navigate(item.to))}
                  >
                    <item.icon />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {instructorHits.length > 0 && (
              <CommandGroup heading="Prowadzacy">
                {instructorHits.map((i) => (
                  <CommandItem
                    key={i.id}
                    value={`prowadzacy ${i.firstName} ${i.lastName} ${i.email}`}
                    onSelect={() => run(() => navigate('/instructors'))}
                  >
                    <User />
                    {i.title ? `${i.title} ` : ''}
                    {i.firstName} {i.lastName}
                    <CommandShortcut>{i.email}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {subjectHits.length > 0 && (
              <CommandGroup heading="Przedmioty">
                {subjectHits.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`przedmiot ${s.name} ${s.code ?? ''}`}
                    onSelect={() => run(() => navigate('/curriculum'))}
                  >
                    <GraduationCap />
                    {s.name}
                    {s.code && <CommandShortcut>{s.code}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {roomHits.length > 0 && (
              <CommandGroup heading="Sale">
                {roomHits.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`sala ${r.number} ${r.buildingName}`}
                    onSelect={() => run(() => navigate('/buildings'))}
                  >
                    <Building2 />
                    {r.number}
                    <CommandShortcut>{r.buildingName}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {facultyHits.length > 0 && (
              <CommandGroup heading="Wydzialy">
                {facultyHits.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={`wydzial ${f.name}`}
                    onSelect={() => run(() => navigate('/faculties'))}
                  >
                    <Landmark />
                    {f.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {fieldHits.length > 0 && (
              <CommandGroup heading="Kierunki">
                {fieldHits.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={`kierunek ${f.name}`}
                    onSelect={() => run(() => navigate('/curriculum'))}
                  >
                    <BookMarked />
                    {f.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {specializationHits.length > 0 && (
              <CommandGroup heading="Specjalnosci">
                {specializationHits.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`specjalnosc ${s.name}`}
                    onSelect={() => run(() => navigate('/curriculum'))}
                  >
                    <Layers />
                    {s.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />

            <CommandGroup heading="Konto">
              {originalAuth && (
                <CommandItem
                  value="wroc do konta admina zakoncz podglad impersonacja"
                  onSelect={() =>
                    run(() => {
                      stopImpersonating();
                      queryClient.clear();
                      navigate('/', { replace: true });
                      toast.success(`Powrot do konta ${originalAuth.user.name}`);
                    })
                  }
                >
                  <Undo2 />
                  Zakoncz podglad i wroc do {originalAuth.user.name}
                </CommandItem>
              )}

              <CommandItem
                value="motyw jasny ciemny theme dark light"
                onSelect={() => run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))}
              >
                {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
                Przelacz na motyw {resolvedTheme === 'dark' ? 'jasny' : 'ciemny'}
              </CommandItem>

              <CommandItem
                value="wyloguj logout wyjdz"
                onSelect={() => run(() => void onLogout())}
              >
                <LogOut />
                Wyloguj
                <CommandShortcut>{user?.email}</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
