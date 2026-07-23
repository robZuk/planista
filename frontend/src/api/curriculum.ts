import { api } from '@/lib/api';
import type {
  AssessmentType,
  CurriculumVersion,
  DegreeLevel,
  SemesterEntries,
  SemesterType,
  StudyMode,
} from '@/types';

export async function fetchAcademicYears(): Promise<string[]> {
  const res = await api.get('/curriculum/academic-years');
  return res.data.data;
}

export async function fetchVersions(): Promise<CurriculumVersion[]> {
  const res = await api.get('/curriculum/versions');
  return res.data.data;
}

export interface CreateVersionInput {
  academicYear: string;
  studyMode: StudyMode;
  degreeLevel: DegreeLevel;
  totalSemesters: number;
  specializationId: string;
  startSemesterType: SemesterType;
}

export async function createVersion(input: CreateVersionInput): Promise<CurriculumVersion> {
  const res = await api.post('/curriculum/versions', input);
  return res.data.data;
}

/** Backend pozwala zmienic tylko liczbe semestrow i flage aktywnosci. */
export async function updateVersion(
  id: string,
  input: { totalSemesters?: number; isActive?: boolean },
): Promise<CurriculumVersion> {
  const res = await api.put(`/curriculum/versions/${id}`, input);
  return res.data.data;
}

export async function deleteVersion(id: string): Promise<void> {
  await api.delete(`/curriculum/versions/${id}`);
}

export interface EntriesResponse {
  version: CurriculumVersion;
  semesters: SemesterEntries[];
}

export async function fetchEntries(versionId: string): Promise<EntriesResponse> {
  const res = await api.get(`/curriculum/versions/${versionId}/entries`);
  return res.data.data;
}

export interface AddEntryInput {
  subjectId: string;
  instructorId?: string;
  semester: number;
  orderInSemester: number;
  hoursLecture?: number;
  hoursExercise?: number;
  hoursLab?: number;
  hoursProject?: number;
  hoursSeminar?: number;
  ects?: number;
  assessmentType?: AssessmentType;
}

export async function addEntry(versionId: string, input: AddEntryInput): Promise<void> {
  await api.post(`/curriculum/versions/${versionId}/entries`, input);
}

export interface UpdateEntryInput {
  instructorId?: string | null;
  hoursLecture?: number;
  hoursExercise?: number;
  hoursLab?: number;
  hoursProject?: number;
  hoursSeminar?: number;
  ects?: number;
  assessmentType?: AssessmentType;
}

export async function updateEntry(id: string, input: UpdateEntryInput): Promise<void> {
  await api.put(`/curriculum/entries/${id}`, input);
}

export async function deleteEntry(id: string): Promise<void> {
  await api.delete(`/curriculum/entries/${id}`);
}
