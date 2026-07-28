import type { ClassType, CurriculumEntry, ScheduleTemplate, StudentGroup } from '@/types';
import { CLASS_TYPES, requiredHours } from './scheduleDisplay';

/**
 * Backlog wzorca tygodnia: co z siatki nie ma jeszcze swojego terminu.
 *
 * Jednostki sie NIE zgadzaja wprost — siatka podaje godziny na caly semestr
 * (`hoursLecture` itd.), a wzorzec opisuje jeden slot tygodniowo. Przelicznikiem
 * jest `teachingWeeks` z kalendarza semestru (SemesterCalendar), stad 30 h wykladu
 * przy 15 tygodniach = 2 h tygodniowo.
 */
export interface UnplannedItem {
  /** Zarazem id przeciaganego elementu w dnd-kit — stad prefiks, zeby nie mylil sie z id wzorca. */
  key: string;
  curriculumEntryId: string;
  subjectName: string;
  classType: ClassType;
  group: StudentGroup;
  /** Prowadzacy z siatki, jesli wpis go wskazuje — inaczej wybierze go dialog. */
  instructorId: string | null;
  requiredSemesterHours: number;
  /** Godziny tygodniowo pozostale do rozstawienia; null = brak kalendarza, wiec nie da sie przeliczyc. */
  remainingWeeklyHours: number | null;
}

export const UNPLANNED_PREFIX = 'unplanned';

/** Zajecia co drugi tydzien wnosza polowe godzin tygodniowo. */
function weeklyHoursOf(template: ScheduleTemplate): number {
  const span = template.endBlock.order - template.startBlock.order + 1;
  return template.weekType === 'EVERY' ? span : span / 2;
}

export interface UnplannedResult {
  items: UnplannedItem[];
  /**
   * Formy zajec, ktore siatka przewiduje, ale nie ma dla nich ani jednej grupy.
   * Bez grupy nie da sie zalozyc wzorca, wiec takie godziny nie trafiaja do `items` —
   * gdyby przemilczec ten przypadek, pusty backlog klamalby, ze wszystko zaplanowane.
   */
  missingGroupTypes: ClassType[];
}

export function computeUnplannedItems({
  entries,
  groups,
  templates,
  teachingWeeks,
}: {
  entries: CurriculumEntry[];
  /** Grupy juz zawezone do kontekstu (kierunek, rocznik, tryb, specjalnosc). */
  groups: StudentGroup[];
  /** Wzorce tego semestru i tej siatki — BEZ filtrow widoku, inaczej backlog by klamal. */
  templates: ScheduleTemplate[];
  teachingWeeks: number | null;
}): UnplannedResult {
  const items: UnplannedItem[] = [];
  const missingGroupTypes = new Set<ClassType>();

  for (const entry of entries) {
    for (const classType of CLASS_TYPES) {
      const required = requiredHours(entry, classType);
      if (required <= 0) continue;

      // Grupa musi pasowac typem do formy zajec — wykladu nie planuje sie grupie
      // laboratoryjnej.
      const matchingGroups = groups.filter((item) => item.type === classType);
      if (matchingGroups.length === 0) {
        missingGroupTypes.add(classType);
        continue;
      }

      for (const group of matchingGroups) {
        const planned = templates
          .filter(
            (template) =>
              template.curriculumEntryId === entry.id &&
              template.classType === classType &&
              template.studentGroup?.id === group.id,
          )
          .reduce((sum, template) => sum + weeklyHoursOf(template), 0);

        const remaining =
          teachingWeeks && teachingWeeks > 0 ? required / teachingWeeks - planned : null;

        // Bez kalendarza nie znamy godzin tygodniowych, wiec za "do zaplanowania"
        // uznajemy tylko pozycje zupelnie puste — lepsze niz zmyslona liczba tygodni.
        // 0.01 zamiast 0: godziny tygodniowe bywaja ulamkowe (np. 20 h / 15 tyg.).
        const todo = remaining === null ? planned === 0 : remaining > 0.01;
        if (!todo) continue;

        items.push({
          key: `${UNPLANNED_PREFIX}::${entry.id}::${classType}::${group.id}`,
          curriculumEntryId: entry.id,
          subjectName: entry.subject.name,
          classType,
          group,
          instructorId: entry.instructor?.id ?? null,
          requiredSemesterHours: required,
          remainingWeeklyHours: remaining,
        });
      }
    }
  }

  return { items, missingGroupTypes: [...missingGroupTypes] };
}

/**
 * Ile blokow zaproponowac przy upuszczeniu pozycji na siatke. Zaokraglone godziny
 * tygodniowe, przyciete do dopuszczalnej dlugosci zajec; bez kalendarza — jeden blok.
 */
export function suggestedBlockCount(item: UnplannedItem, maxBlocks: number): number {
  const raw = item.remainingWeeklyHours ?? 1;
  return Math.min(Math.max(Math.round(raw), 1), maxBlocks);
}

/** Godziny bez zbednego ".0" — 2 zamiast 2.0, ale 1.3 zostaje 1.3. */
export function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
