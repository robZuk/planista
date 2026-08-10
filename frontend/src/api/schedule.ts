import { api } from '@/lib/api';
import type {
  ClassType,
  DayOfWeek,
  EntryStatus,
  PublicHoliday,
  ScheduleEntry,
  ScheduleTemplate,
  SemesterCalendar,
  SemesterRangeSource,
  SemesterType,
  StudyMode,
  WeekType,
} from '@/types';

// ─── Wzorce tygodnia ─────────────────────────────────────────

export async function fetchTemplates(filters: {
  semester?: number;
  academicYear?: string;
  studyMode?: StudyMode;
  studentGroupId?: string;
  fieldOfStudyId?: string;
  specializationId?: string;
  facultyId?: string;
}): Promise<ScheduleTemplate[]> {
  const res = await api.get('/schedule/templates', { params: filters });
  return res.data.data;
}

export interface TemplateInput {
  curriculumEntryId: string;
  classType: ClassType;
  roomId: string;
  instructorId: string;
  studentGroupId?: string | null;
  dayOfWeek: DayOfWeek;
  startBlockId: string;
  endBlockId: string;
  semester: number;
  academicYear: string;
  weekType?: WeekType;
  studyMode?: StudyMode;
}

export async function createTemplate(input: TemplateInput): Promise<ScheduleTemplate> {
  const res = await api.post('/schedule/templates', input);
  return res.data.data;
}

export async function updateTemplate(
  id: string,
  input: Partial<TemplateInput>,
): Promise<ScheduleTemplate> {
  const res = await api.put(`/schedule/templates/${id}`, input);
  return res.data.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/schedule/templates/${id}`);
}

/**
 * Kasowanie calego wzorca tygodnia naraz. Zakres idzie lista id, bo to widok
 * decyduje, co skladalo sie na "ten wzorzec" (rok, tryb, pora semestru).
 */
export async function deleteTemplates(ids: string[]): Promise<{ deleted: number }> {
  const res = await api.delete('/schedule/templates', { data: { ids } });
  return res.data.data;
}

export interface CoverageSummary {
  semesters: {
    semester: number;
    subjects: {
      subjectName: string;
      classType: ClassType;
      planned: number;
      required: number;
      remaining: number;
      completed: boolean;
      groups: { groupName: string; planned: number; required: number; completed: boolean }[];
    }[];
  }[];
}

export async function fetchCoverageSummary(curriculumVersionId: string): Promise<CoverageSummary> {
  const res = await api.get(`/schedule/templates/summary/${curriculumVersionId}`);
  return res.data.data;
}

// ─── Generator terminow ──────────────────────────────────────

export interface GenerateResult {
  /** Ile terminow wydzialu skasowalo nadpisanie (`manual` = dodane recznie). */
  deleted: { total: number; manual: number };
  created: number;
  skipped: number;
  conflicts: number;
  range: { startDate: string; endDate: string; source: SemesterRangeSource };
}

/**
 * Generowanie NADPISUJE kalendarz wydzialu w calosci, dlatego facultyId jest
 * wymagany — nie ma wariantu "wszystkie wydzialy naraz".
 */
export async function generateSemesterEntries(input: {
  templateIds: string[];
  academicYear: string;
  semesterType: SemesterType;
  studyMode: StudyMode;
  facultyId: string;
  /** Zawezenie nadpisania: dotyczy TAKZE kasowania, nie tylko rozpisywania wzorcow. */
  scope?: { fieldOfStudyId?: string; specializationId?: string; semester?: number };
}): Promise<{ data: GenerateResult; message: string }> {
  const res = await api.post('/schedule/generate', input);
  return res.data;
}

// ─── Terminy (kalendarz semestru) ────────────────────────────

export async function fetchEntries(filters: {
  from?: string;
  to?: string;
  studentGroupId?: string;
  instructorId?: string;
  status?: EntryStatus;
  facultyId?: string;
}): Promise<ScheduleEntry[]> {
  const res = await api.get('/schedule/entries', { params: filters });
  return res.data.data;
}

export interface CreateEntryInput {
  date: string;
  classType: ClassType;
  roomId: string;
  instructorId: string;
  studentGroupId?: string | null;
  curriculumEntryId: string;
  startBlockId: string;
  endBlockId: string;
  status?: EntryStatus;
}

export async function createEntry(input: CreateEntryInput): Promise<ScheduleEntry> {
  const res = await api.post('/schedule/entries', input);
  return res.data.data;
}

export async function updateEntryStatus(id: string, status: EntryStatus): Promise<ScheduleEntry> {
  const res = await api.put(`/schedule/entries/${id}/status`, { status });
  return res.data.data;
}

export async function deleteEntry(
  id: string,
  // ONE = tylko ten termin, ALL = ten i wszystkie kolejne z tej serii (jak przy przenoszeniu).
  scope: 'ONE' | 'ALL' = 'ONE',
): Promise<{ message: string }> {
  const res = await api.delete(`/schedule/entries/${id}`, { data: { scope } });
  return res.data;
}

/**
 * Wyczyszczenie kalendarza semestru jednego wydzialu — zakres dat backend liczy
 * sam, tak samo jak przy generowaniu. Wzorce tygodnia zostaja nietkniete.
 */
export async function deleteSemesterEntries(input: {
  academicYear: string;
  semesterType: SemesterType;
  studyMode: StudyMode;
  facultyId: string;
  /** Zawezenie kasowania — ten sam ksztalt co przy generowaniu. */
  scope?: { fieldOfStudyId?: string; specializationId?: string; semester?: number };
}): Promise<{
  deleted: { total: number; manual: number };
  range: { startDate: string; endDate: string; source: SemesterRangeSource };
}> {
  const res = await api.delete('/schedule/entries', { data: input });
  return res.data.data;
}

export async function moveEntry(
  id: string,
  input: {
    newDate: string;
    newStartBlockId: string;
    newEndBlockId: string;
    newRoomId?: string;
    newInstructorId?: string;
    /** ONE = tylko ten termin, ALL = ten i wszystkie kolejne z tego wzorca. */
    scope: 'ONE' | 'ALL';
  },
): Promise<{ data: unknown; message: string }> {
  const res = await api.post(`/schedule/entries/${id}/move`, input);
  return res.data;
}

// ─── Kalendarz semestru ──────────────────────────────────────

export async function fetchCalendars(): Promise<SemesterCalendar[]> {
  const res = await api.get('/schedule/calendars');
  return res.data.data;
}

export async function createCalendar(input: {
  academicYear: string;
  semesterType: SemesterType;
  studyMode: StudyMode;
  startDate: string;
  endDate: string;
  /** Wymagany, chyba ze `allFaculties`. Dziekanatowi i tak wymuszamy jego wlasny wydzial. */
  facultyId?: string;
  /** Wspolne daty dla calej uczelni = wiersz na kazdy wydzial. Wydzialy z wlasnym
   *  kalendarzem sa pomijane, wiec `data` jest wtedy puste — liczy sie `message`. */
  allFaculties?: boolean;
}): Promise<{ data: SemesterCalendar | null; message: string }> {
  const res = await api.post('/schedule/calendars', input);
  return res.data;
}

export async function updateCalendar(
  id: string,
  input: { startDate?: string; endDate?: string },
): Promise<SemesterCalendar> {
  const res = await api.put(`/schedule/calendars/${id}`, input);
  return res.data.data;
}

export async function deleteCalendar(id: string): Promise<void> {
  await api.delete(`/schedule/calendars/${id}`);
}

// ─── Dni wolne ───────────────────────────────────────────────

export async function fetchHolidays(filters?: {
  from?: string;
  to?: string;
}): Promise<PublicHoliday[]> {
  const res = await api.get('/schedule/holidays', { params: filters });
  return res.data.data;
}

export async function createHoliday(input: { date: string; name: string }): Promise<PublicHoliday> {
  const res = await api.post('/schedule/holidays', input);
  return res.data.data;
}

export async function deleteHoliday(id: string): Promise<void> {
  await api.delete(`/schedule/holidays/${id}`);
}
