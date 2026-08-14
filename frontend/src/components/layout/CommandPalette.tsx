import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { LogOut, Moon, Search, Sun, Undo2 } from 'lucide-react';
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
import { visibleGroups } from '@/lib/navigation';
import { useAuthStore } from '@/store/authStore';

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
            placeholder="Wpisz nazwe strony lub akcji…"
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
