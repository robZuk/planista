import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SemesterType } from '@/types';

/**
 * Globalny kontekst rok akademicki + typ semestru. Uzywany PER-STRONA (nie w AppShell) —
 * kazdy widok, ktory tego potrzebuje, sam osadza <AcademicYearSelector/>. Na widokach
 * referencyjnych (wydzialy, sale, prowadzacy) go nie ma, bo tam rok nic nie zmienia.
 */
interface AcademicYearState {
  academicYear: string;
  semesterType: SemesterType;
  setAcademicYear: (year: string) => void;
  setSemesterType: (type: SemesterType) => void;
}

export const useAcademicYearStore = create<AcademicYearState>()(
  persist(
    (set) => ({
      academicYear: '2024/2025',
      semesterType: 'WINTER',
      setAcademicYear: (academicYear) => set({ academicYear }),
      setSemesterType: (semesterType) => set({ semesterType }),
    }),
    { name: 'planista7-academic-year' },
  ),
);
