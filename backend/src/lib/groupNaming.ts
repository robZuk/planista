import type { GroupType } from '@prisma/client';

/**
 * Generowanie nazw grup wg konwencji: {PREFIX}-{rokStudiow}-{TYP}[-{etykieta}].
 * W planista7 grupy sa per ROK STUDIOW (nie semestr, patrz docs/model-danych.md #4),
 * wiec — w odroznieniu od planista3 — parametrem jest studyYear, nie semester.
 */

const EXERCISE_LABELS = ['A', 'B', 'C', 'D', 'E'];
const LAB_SUFFIXES = ['1', '2', '3', '4', '5', '6', '7', '8'];

export function generateGroupName(
  prefix: string, // np. "EDST" lub "DUT"
  studyYear: number, // np. 1, 2, 3...
  type: GroupType,
  index: number, // 0, 1, 2...
  parentIndex?: number, // dla LAB — indeks grupy cwiczeniowej-rodzica
): string {
  const base = `${prefix}-${studyYear}`;
  switch (type) {
    case 'LECTURE':
      return `${base}-W`;
    case 'EXERCISE':
      return `${base}-C-${EXERCISE_LABELS[index]}`;
    case 'LAB':
      return `${base}-L-${EXERCISE_LABELS[parentIndex!]}${LAB_SUFFIXES[index]}`;
    case 'PROJECT':
      return `${base}-P-${EXERCISE_LABELS[index]}`;
    case 'SEMINAR':
      return `${base}-S-${EXERCISE_LABELS[index]}`;
  }
}
