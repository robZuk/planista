import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StudyMode } from '@/types';
import type { WeekView } from '@/lib/scheduleDisplay';

/**
 * Trwale filtry widoku Plan zajec — zeby po wyjsciu na inny widok i powrocie
 * (odmontowanie komponentu) wybor nie wracal do wartosci domyslnych. Rok akademicki,
 * wydzial i kierunek maja wlasne, osobne store'y (sa wspoldzielone miedzy stronami).
 * Kazda zakladka trzyma wlasny zestaw — Wzorzec i Kalendarz nie wspoldziela filtrow.
 */

interface TemplateFilters {
  studyMode: StudyMode;
  // versionId: konkretna siatka (= specjalnosc), 'all' = wszystkie, '' = brak.
  versionId: string;
  // semester: konkretny numer, 'all' = wszystkie, null = brak dostepnych.
  semester: number | 'all' | null;
  roomFilter: string;
  instructorFilter: string;
  classTypeFilter: string;
  groupFilter: string;
  weekView: WeekView;
}

interface TemplateFilterStore extends TemplateFilters {
  set: (patch: Partial<TemplateFilters>) => void;
}

export const useTemplateFilterStore = create<TemplateFilterStore>()(
  persist(
    (set) => ({
      studyMode: 'FULL_TIME',
      versionId: '',
      semester: null,
      roomFilter: 'all',
      instructorFilter: 'all',
      classTypeFilter: 'all',
      groupFilter: 'all',
      weekView: 'all',
      set: (patch) => set(patch),
    }),
    { name: 'planista7-template-filters' },
  ),
);

interface CalendarFilters {
  studyMode: StudyMode;
  versionFilter: string;
  semesterFilter: number | 'all';
  roomFilter: string;
  instructorFilter: string;
  classTypeFilter: string;
  groupFilter: string;
}

interface CalendarFilterStore extends CalendarFilters {
  set: (patch: Partial<CalendarFilters>) => void;
}

export const useCalendarFilterStore = create<CalendarFilterStore>()(
  persist(
    (set) => ({
      studyMode: 'FULL_TIME',
      versionFilter: 'all',
      semesterFilter: 'all',
      roomFilter: 'all',
      instructorFilter: 'all',
      classTypeFilter: 'all',
      groupFilter: 'all',
      set: (patch) => set(patch),
    }),
    { name: 'planista7-calendar-filters' },
  ),
);
