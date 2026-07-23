import { api } from '@/lib/api';
import type { FieldOfStudy } from '@/types';

export async function fetchFieldsOfStudy(facultyId?: string): Promise<FieldOfStudy[]> {
  const res = await api.get('/fields-of-study', { params: facultyId ? { facultyId } : undefined });
  return res.data.data;
}

export async function createFieldOfStudy(input: {
  name: string;
  shortName: string;
  facultyId: string;
}): Promise<FieldOfStudy> {
  const res = await api.post('/fields-of-study', input);
  return res.data.data;
}

export async function deleteFieldOfStudy(id: string): Promise<void> {
  await api.delete(`/fields-of-study/${id}`);
}
