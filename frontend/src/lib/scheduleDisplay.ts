import type { ClassType, DayOfWeek, EntryStatus, RoomType, StudyMode, WeekType } from '@/types';

export const CLASS_TYPES: ClassType[] = ['LECTURE', 'EXERCISE', 'LAB', 'PROJECT', 'SEMINAR'];

/** Maksymalna dlugosc jednych zajec we wzorcu, w blokach godzinowych. */
export const MAX_TEMPLATE_BLOCKS = 4;

/** Jednoliterowe skroty na blokach w siatce — miejsca jest tam malo. */
export const CLASS_LABELS: Record<ClassType, string> = {
  LECTURE: 'W',
  EXERCISE: 'C',
  LAB: 'L',
  PROJECT: 'P',
  SEMINAR: 'S',
};

export const CLASS_FULL_LABELS: Record<ClassType, string> = {
  LECTURE: 'Wyklad',
  EXERCISE: 'Cwiczenia',
  LAB: 'Laboratorium',
  PROJECT: 'Projekt',
  SEMINAR: 'Seminarium',
};

/**
 * Kolory tla i lewej krawedzi bloku, per typ zajec.
 *
 * To kolory TEMATYCZNE — maja rozrozniac typy zajec, a nie niesc znaczenie
 * semantyczne motywu (primary/destructive), wiec swiadomie omijaja tokeny shadcn
 * i podaja jawne warianty `dark:`.
 */
export const CLASS_COLORS: Record<ClassType, string> = {
  LECTURE:
    'bg-blue-100 border-blue-400 text-blue-900 dark:bg-blue-950 dark:border-blue-600 dark:text-blue-100',
  EXERCISE:
    'bg-green-100 border-green-400 text-green-900 dark:bg-green-950 dark:border-green-600 dark:text-green-100',
  LAB: 'bg-orange-100 border-orange-400 text-orange-900 dark:bg-orange-950 dark:border-orange-600 dark:text-orange-100',
  PROJECT:
    'bg-purple-100 border-purple-400 text-purple-900 dark:bg-purple-950 dark:border-purple-600 dark:text-purple-100',
  SEMINAR:
    'bg-pink-100 border-pink-400 text-pink-900 dark:bg-pink-950 dark:border-pink-600 dark:text-pink-100',
};

export const WEEK_TYPE_LABELS: Record<WeekType, string> = {
  EVERY: 'Co tydzien',
  EVEN: 'Tygodnie parzyste',
  ODD: 'Tygodnie nieparzyste',
};

export const WEEK_TYPE_SHORT: Record<WeekType, string> = {
  EVERY: '',
  EVEN: 'parz.',
  ODD: 'nieparz.',
};

/**
 * Etykieta rotacji tygodniowej pokazywana na kazdym bloku wzorca — w nomenklaturze
 * A/B zamiast parzyste/nieparzyste. Tydzien 1 semestru jest nieparzysty (ODD), stad
 * ODD = "Tydzien A", EVEN = "Tydzien B".
 */
export const WEEK_TYPE_BADGE: Record<WeekType, string> = {
  EVERY: 'Co tydzien',
  ODD: 'Tydzien A',
  EVEN: 'Tydzien B',
};

export const STATUS_LABELS: Record<EntryStatus, string> = {
  SCHEDULED: 'Zaplanowane',
  CANCELLED: 'Odwolane',
  MAKEUP: 'Odrobienie',
};

const DAY_LABELS_FULL: { key: DayOfWeek; label: string }[] = [
  { key: 'MONDAY', label: 'Poniedzialek' },
  { key: 'TUESDAY', label: 'Wtorek' },
  { key: 'WEDNESDAY', label: 'Sroda' },
  { key: 'THURSDAY', label: 'Czwartek' },
  { key: 'FRIDAY', label: 'Piatek' },
];

const DAY_LABELS_PART: { key: DayOfWeek; label: string }[] = [
  { key: 'FRIDAY', label: 'Piatek' },
  { key: 'SATURDAY', label: 'Sobota' },
  { key: 'SUNDAY', label: 'Niedziela' },
];

/**
 * Dni widoczne w siatce zaleza od trybu studiow — backend i tak odrzuci zajecia
 * poza oknem (stacjonarne pn-pt, niestacjonarne pt od 15:00 / sob / nd),
 * wiec nie pokazujemy kolumn, w ktorych nic nie mozna postawic.
 */
export function daysForMode(studyMode: StudyMode): { key: DayOfWeek; label: string }[] {
  return studyMode === 'PART_TIME' ? DAY_LABELS_PART : DAY_LABELS_FULL;
}

/**
 * Lustro backend/src/lib/scheduleTime.ts — jakie typy sal pasuja do typu zajec.
 * Uzywane do zawezenia listy sal w formularzu, zeby nie trafiac w blad WRONG_ROOM_TYPE.
 */
export const ROOM_TYPES_FOR_CLASS: Record<ClassType, RoomType[]> = {
  LECTURE: ['LECTURE', 'EXERCISE'],
  EXERCISE: ['EXERCISE', 'LECTURE'],
  LAB: ['LAB', 'COMPUTER_LAB'],
  PROJECT: ['EXERCISE', 'COMPUTER_LAB', 'SEMINAR'],
  SEMINAR: ['SEMINAR', 'EXERCISE'],
};

/** Ile godzin danego typu przewiduje wpis siatki — potrzebne przy planowaniu. */
export function requiredHours(
  entry: {
    hoursLecture: number;
    hoursExercise: number;
    hoursLab: number;
    hoursProject: number;
    hoursSeminar: number;
  },
  classType: ClassType,
): number {
  switch (classType) {
    case 'LECTURE':
      return entry.hoursLecture;
    case 'EXERCISE':
      return entry.hoursExercise;
    case 'LAB':
      return entry.hoursLab;
    case 'PROJECT':
      return entry.hoursProject;
    case 'SEMINAR':
      return entry.hoursSeminar;
  }
}
