import {
  Building2,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  Clock,
  GraduationCap,
  LayoutDashboard,
  School,
  ShieldCheck,
  Table2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Role, ktore widza ten link. */
  roles: Role[];
  /** Slowa kluczowe dla palety polecen (Ctrl+K) — poza samym labelem. */
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Jedno zrodlo prawdy dla nawigacji: sidebar, breadcrumbs i paleta polecen
 * czytaja z tej samej struktury. Dodanie strony = dopisanie jednego wpisu.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Planowanie',
    items: [
      {
        to: '/',
        label: 'Panel glowny',
        icon: LayoutDashboard,
        roles: ['ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT'],
        keywords: ['dashboard', 'start', 'statystyki'],
      },
      {
        to: '/curriculum',
        label: 'Siatka godzin',
        icon: Table2,
        roles: ['ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR'],
        keywords: ['program', 'przedmioty', 'ects', 'kierunki'],
      },
      {
        to: '/schedule',
        label: 'Plan zajec',
        icon: CalendarDays,
        roles: ['ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT'],
        keywords: ['harmonogram', 'wzorzec', 'kalendarz'],
      },
    ],
  },
  {
    label: 'Zasoby',
    items: [
      {
        to: '/groups',
        label: 'Grupy',
        icon: Users,
        roles: ['ADMIN'],
        keywords: ['studenci', 'podgrupy', 'roczniki'],
      },
      {
        to: '/faculties',
        label: 'Wydzialy',
        icon: School,
        roles: ['ADMIN', 'DEAN_OFFICE'],
      },
      {
        to: '/buildings',
        label: 'Budynki i sale',
        icon: Building2,
        roles: ['ADMIN', 'DEAN_OFFICE'],
        keywords: ['pokoje', 'laboratoria', 'pojemnosc'],
      },
      {
        to: '/instructors',
        label: 'Prowadzacy',
        icon: GraduationCap,
        roles: ['ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR'],
        keywords: ['wykladowcy', 'kadra'],
      },
    ],
  },
  {
    label: 'Ustawienia',
    items: [
      {
        to: '/semester-calendars',
        label: 'Kalendarz semestru',
        icon: CalendarRange,
        roles: ['ADMIN', 'DEAN_OFFICE'],
        keywords: ['semestr', 'zakres', 'daty', 'tygodnie'],
      },
      {
        to: '/holidays',
        label: 'Dni wolne',
        icon: CalendarOff,
        roles: ['ADMIN', 'DEAN_OFFICE'],
        keywords: ['swieta', 'wolne'],
      },
      {
        to: '/time-blocks',
        label: 'Bloki czasowe',
        icon: Clock,
        roles: ['ADMIN'],
        keywords: ['godziny', 'dzwonki'],
      },
      {
        to: '/users',
        label: 'Uzytkownicy',
        icon: ShieldCheck,
        roles: ['ADMIN'],
        keywords: ['konta', 'role', 'impersonacja'],
      },
    ],
  },
];

/** Plaska lista wszystkich pozycji — wygodna do breadcrumbow i wyszukiwania. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Grupy przefiltrowane pod role; grupy bez widocznych pozycji znikaja w calosci. */
export function visibleGroups(role: Role | undefined): NavGroup[] {
  if (!role) return [];
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

/**
 * Sciezka breadcrumbow dla adresu: [nazwa grupy, nazwa strony].
 * Dopasowanie po prefiksie, zeby /schedule/kalendarz tez trafil w "Plan zajec".
 */
export function breadcrumbFor(pathname: string): { group: string; item: NavItem } | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const matches = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
      if (matches) return { group: group.label, item };
    }
  }
  return null;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  DEAN_OFFICE: 'Dziekanat',
  INSTRUCTOR: 'Prowadzacy',
  STUDENT: 'Student',
};
