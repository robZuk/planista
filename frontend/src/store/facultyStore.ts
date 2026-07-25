import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Globalny filtr wydzialu dla widoku Siatka godzin (zakladki Siatki / Kierunki i
 * specjalnosci). 'all' = brak filtra. Przedmioty go nie uzywaja — to slownik
 * wspolny dla calej uczelni, bez pola wydzialu.
 */
interface FacultyFilterState {
  facultyId: string;
  setFacultyId: (facultyId: string) => void;
}

export const useFacultyFilterStore = create<FacultyFilterState>()(
  persist(
    (set) => ({
      facultyId: 'all',
      setFacultyId: (facultyId) => set({ facultyId }),
    }),
    { name: 'planista7-faculty-filter' },
  ),
);
