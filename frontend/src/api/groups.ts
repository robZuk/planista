import { api } from '@/lib/api';
import type { GroupType, StudentGroup, StudyMode } from '@/types';

export async function fetchGroups(filters: {
  fieldOfStudyId?: string;
  specializationId?: string;
  studyYear?: number;
  academicYear?: string;
  studyMode?: StudyMode;
}): Promise<StudentGroup[]> {
  const res = await api.get('/groups', { params: filters });
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
  studyMode?: StudyMode;
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

/** Kopiuje caly sklad grup danego roku na kolejny rok akademicki (musi byc pusty). */
export async function copyGroupsToNextYear(
  academicYear: string,
): Promise<{ targetYear: string; count: number }> {
  const res = await api.post('/groups/copy-to-next-year', { academicYear });
  return res.data.data;
}
