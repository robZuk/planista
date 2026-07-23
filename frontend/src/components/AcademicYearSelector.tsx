import { useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchAcademicYears } from '@/api/curriculum';
import { useAcademicYearStore } from '@/store/academicYearStore';
import { SEMESTER_TYPE_LABELS } from '@/lib/semester';
import type { SemesterType } from '@/types';

/**
 * Przelacznik rok akademicki (+ opcjonalnie typ semestru), osadzany w widokach,
 * ktore od niego zaleza.
 *
 * `yearOnly` — dla widokow, gdzie typ semestru jest bez znaczenia (np. Grupy sa per
 * ROK, nie semestr — pokazywanie martwego selecta byloby mylace).
 */
export function AcademicYearSelector({ yearOnly = false }: { yearOnly?: boolean }) {
  const { academicYear, semesterType, setAcademicYear, setSemesterType } = useAcademicYearStore();
  const { data: years } = useQuery({ queryKey: ['academic-years'], queryFn: fetchAcademicYears });

  // Jesli wybrany rok nie wystepuje jeszcze w danych (np. swiezo ustawiony rok bez
  // zadnej siatki), i tak go pokazujemy — inaczej wartosc selecta by "znikala".
  const options = years?.includes(academicYear) ? years : [academicYear, ...(years ?? [])];

  return (
    <div className="flex items-center gap-2">
      <Select value={academicYear} onValueChange={setAcademicYear}>
        <SelectTrigger className="w-40" aria-label="Rok akademicki">
          <CalendarRange className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((year) => (
            <SelectItem key={year} value={year}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!yearOnly && (
        <Select value={semesterType} onValueChange={(v) => setSemesterType(v as SemesterType)}>
          <SelectTrigger className="w-32" aria-label="Typ semestru">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SEMESTER_TYPE_LABELS) as SemesterType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {SEMESTER_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
