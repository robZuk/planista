import { api } from '@/lib/api';
import type { GroupProposalItem, GroupType, StudentGroup, StudyMode } from '@/types';

export async function fetchGroups(filters: {
  fieldOfStudyId?: string;
  specializationId?: string;
  studyYear?: number;
  academicYear?: string;
}): Promise<StudentGroup[]> {
  const res = await api.get('/groups', { params: filters });
  return res.data.data;
}

export interface GenerateInput {
  fieldOfStudyId: string;
  specializationId?: string;
  studyYear: number;
  academicYear: string;
  totalStudents: number;
  studyMode?: StudyMode;
  /** Liczba grup cwiczeniowych — podaje dziekanat (nie wyliczamy z pojemnosci sal). */
  exerciseGroupCount?: number;
  /** Liczba podgrup laboratoryjnych NA KAZDA grupe cwiczeniowa. */
  labPerExercise?: number;
}

export interface GenerateResult {
  proposal: GroupProposalItem[];
  meta: { totalStudents: number; academicYear: string; studyYear: number };
}

/** Zwraca propozycje — NIC nie zapisuje. Zapis dopiero w confirmGroups. */
export async function generateGroups(input: GenerateInput): Promise<GenerateResult> {
  const res = await api.post('/groups/generate', input);
  return res.data.data;
}

export async function confirmGroups(input: {
  fieldOfStudyId: string;
  specializationId?: string;
  academicYear: string;
  proposal: GroupProposalItem[];
}): Promise<StudentGroup[]> {
  const res = await api.post('/groups/confirm', input);
  return res.data.data;
}

export interface CreateGroupInput {
  name: string;
  type: GroupType;
  size: number;
  fieldOfStudyId: string;
  specializationId?: string;
  studyYear: number;
  academicYear: string;
  parentGroupId?: string;
  preferredRoomId?: string;
}

export async function createGroup(input: CreateGroupInput): Promise<StudentGroup> {
  const res = await api.post('/groups', input);
  return res.data.data;
}

/** Backend pozwala zmienic tylko nazwe i liczebnosc — typ i miejsce w hierarchii sa stale. */
export async function updateGroup(
  id: string,
  input: { name?: string; size?: number },
): Promise<StudentGroup> {
  const res = await api.put(`/groups/${id}`, input);
  return res.data.data;
}

export async function deleteGroup(id: string): Promise<void> {
  await api.delete(`/groups/${id}`);
}

export async function deleteAllGroups(academicYear: string): Promise<void> {
  await api.delete('/groups', { params: { academicYear } });
}
