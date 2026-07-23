import { api } from '@/lib/api';
import type { Faculty } from '@/types';

export interface FacultyInput {
  name: string;
  shortName: string;
}

export async function fetchFaculties(): Promise<Faculty[]> {
  const res = await api.get('/faculties');
  return res.data.data;
}

export async function createFaculty(input: FacultyInput): Promise<Faculty> {
  const res = await api.post('/faculties', input);
  return res.data.data;
}

export async function updateFaculty(id: string, input: FacultyInput): Promise<Faculty> {
  const res = await api.put(`/faculties/${id}`, input);
  return res.data.data;
}

export async function deleteFaculty(id: string): Promise<void> {
  await api.delete(`/faculties/${id}`);
}
