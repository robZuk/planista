import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Globalny filtr kierunku (FieldOfStudy) — wspolny dla widokow Plan zajec i Siatka
 * godzin (zakladka Siatki). 'all' = brak filtra.
 * Kaskaduje od filtra wydzialu ([[facultyStore]]): wybor innego wydzialu, ktory nie
 * zawiera aktualnego kierunku, resetuje ten filtr na 'all' (patrz FieldOfStudySelector).
 */
interface FieldFilterState {
  fieldOfStudyId: string;
  setFieldOfStudyId: (fieldOfStudyId: string) => void;
}

export const useFieldFilterStore = create<FieldFilterState>()(
  persist(
    (set) => ({
      fieldOfStudyId: 'all',
      setFieldOfStudyId: (fieldOfStudyId) => set({ fieldOfStudyId }),
    }),
    { name: 'planista7-field-filter' },
  ),
);
