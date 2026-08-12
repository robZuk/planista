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
  /** Grupa jest zastepcza — jej typ nie odpowiada formie zajec (patrz `groupsForClassType`). */
  groupIsFallback: boolean;
}

export const UNPLANNED_PREFIX = 'unplanned';

/** Zajecia co drugi tydzien wnosza polowe godzin tygodniowo. */
function weeklyHoursOf(template: ScheduleTemplate): number {
  const span = template.endBlock.order - template.startBlock.order + 1;
  return template.weekType === 'EVERY' ? span : span / 2;
}

/**
 * Formy zajec, dla ktorych uczelnie rzadko zakladaja osobne grupy — seminarium i
 * projekt prowadzi sie zwykle skladem cwiczeniowym, a w ostatecznosci wykladowym.
 * Ani dialog wzorca, ani backend nie wymagaja zgodnosci typu grupy z forma zajec,
 * wiec backlog tez nie moze byc od nich ostrzejszy: bez tej sciezki godziny
 * seminarium ladowaly w ostrzezeniu "nie da sie zaplanowac", choc rece planisty
 * zaplanowac je moga.
 */
const GROUP_TYPE_FALLBACKS: Partial<Record<ClassType, ClassType[]>> = {
  SEMINAR: ['EXERCISE', 'LECTURE'],
  PROJECT: ['EXERCISE', 'LECTURE'],
};

/** Grupy do obsadzenia danej formy: najpierw pasujace typem, potem zastepcze. */
function groupsForClassType(
  groups: StudentGroup[],
  classType: ClassType,
): { groups: StudentGroup[]; isFallback: boolean } {
  // Grupa musi pasowac typem do formy zajec — wykladu nie planuje sie grupie
  // laboratoryjnej.
  const exact = groups.filter((group) => group.type === classType);
  if (exact.length > 0) return { groups: exact, isFallback: false };

  for (const fallback of GROUP_TYPE_FALLBACKS[classType] ?? []) {
    const substitute = groups.filter((group) => group.type === fallback);
    if (substitute.length > 0) return { groups: substitute, isFallback: true };
  }

  return { groups: [], isFallback: false };
}

export interface UnplannedResult {
  items: UnplannedItem[];
  /**
   * Formy zajec, ktore siatka przewiduje, ale nie ma dla nich ani jednej grupy —
   * takze zastepczej. Bez grupy nie da sie zalozyc wzorca, wiec takie godziny nie
   * trafiaja do `items`; gdyby przemilczec ten przypadek, pusty backlog klamalby,
   * ze wszystko zaplanowane.
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

      const { groups: matchingGroups, isFallback } = groupsForClassType(groups, classType);
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
          groupIsFallback: isFallback,
        });
      }
    }
  }

  return { items, missingGroupTypes: [...missingGroupTypes] };
}

/**
 * Kazda pozycja z backlogu laduje na siatce jako jeden blok — planista wydluza
 * zajecia sam, juz na planie. Proponowanie dluzszych blokow z godzin tygodniowych
 * czesciej przeszkadzalo, niz pomagalo.
 */
export const UNPLANNED_DROP_BLOCKS = 1;
