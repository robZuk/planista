import type { AssessmentType, DegreeLevel, GroupType, RoomType, StudyMode } from '@/types';

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

export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  FULL_TIME: 'Stacjonarne',
  PART_TIME: 'Niestacjonarne',
};

export const STUDY_MODES = Object.keys(STUDY_MODE_LABELS) as StudyMode[];

export const DEGREE_LEVEL_LABELS: Record<DegreeLevel, string> = {
  BACHELOR: 'I stopnia (inz./lic.)',
  MASTER: 'II stopnia (mgr)',
};

export const DEGREE_LEVELS = Object.keys(DEGREE_LEVEL_LABELS) as DegreeLevel[];

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  EXAM: 'Egzamin',
  CREDIT: 'Zaliczenie',
};

export const ASSESSMENT_TYPES = Object.keys(ASSESSMENT_TYPE_LABELS) as AssessmentType[];

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  LECTURE: 'Wykladowa',
  EXERCISE: 'Cwiczeniowa',
  LAB: 'Laboratoryjna',
  PROJECT: 'Projektowa',
  SEMINAR: 'Seminaryjna',
};

export const GROUP_TYPES = Object.keys(GROUP_TYPE_LABELS) as GroupType[];
