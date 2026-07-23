import type { RoomType } from '@/types';

/** Polskie nazwy typow sal (backend trzyma enumy po angielsku). */
export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  LECTURE: 'Wykladowa',
  EXERCISE: 'Cwiczeniowa',
  LAB: 'Laboratorium',
  COMPUTER_LAB: 'Pracownia komputerowa',
  SEMINAR: 'Seminaryjna',
  SPORTS: 'Sportowa',
};

export const ROOM_TYPES = Object.keys(ROOM_TYPE_LABELS) as RoomType[];
