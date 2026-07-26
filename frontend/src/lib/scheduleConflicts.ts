import type { DayOfWeek, StudyMode, WeekType } from '@/types';

/**
 * Podglad dostepnosci komorek siatki podczas przeciagania — port logiki konfliktow
 * z backendu (scheduleValidation.ts / scheduleTime.ts). To tylko PODPOWIEDZ wizualna:
 * ostateczna walidacja i tak dzieje sie na backendzie przy zapisie, wiec drobne
 * rozjazdy (np. rzadkie przypadki brzegowe) nie psuja funkcjonalnosci — najwyzej
 * kolor przez chwile klamie, a serwer i tak odrzuci zly drop z komunikatem.
 */

// Zajecie zajmuje bloki [aStart..aEnd] wlacznie — konflikt gdy przedzialy order sie przecinaja.
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export const DAY_TO_NUM: Record<DayOfWeek, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function minutesFromTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Okno trybu studiow: FULL_TIME pon-pt, PART_TIME pt od 15:00 + sob/nd. */
export function isTimeWindowOk(dayNum: number, startTime: string, studyMode: StudyMode): boolean {
  if (studyMode === 'FULL_TIME') return dayNum >= 1 && dayNum <= 5;
  if (dayNum >= 1 && dayNum <= 4) return false;
  if (dayNum === 5) return minutesFromTime(startTime) >= 15 * 60;
  return true; // sobota/niedziela
}

/** EVERY koliduje ze wszystkim; EVEN/ODD koliduja tylko z tym samym typem lub EVERY. */
export function weekTypesConflict(a: WeekType, b: WeekType): boolean {
  if (a === 'EVERY' || b === 'EVERY') return true;
  return a === b;
}

/**
 * Cala "rodzina" grupy: sama grupa + przodkowie + potomkowie (bez rodzenstwa).
 * Klient-side odpowiednik lib/groupFamily.ts na backendzie — dziala na juz
 * zaladowanej liscie grup zamiast odpytywac baze.
 */
export function getGroupFamilyIds(
  groupId: string,
  groups: { id: string; parentGroupId: string | null }[],
): string[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const result = new Set<string>([groupId]);

  let curr = byId.get(groupId);
  while (curr?.parentGroupId) {
    result.add(curr.parentGroupId);
    curr = byId.get(curr.parentGroupId);
  }

  const queue = [groupId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const g of groups) {
      if (g.parentGroupId === id && !result.has(g.id)) {
        result.add(g.id);
        queue.push(g.id);
      }
    }
  }

  return [...result];
}
