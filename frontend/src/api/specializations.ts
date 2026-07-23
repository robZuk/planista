import { api } from '@/lib/api';
import type { Specialization } from '@/types';

export async function fetchSpecializations(fieldOfStudyId?: string): Promise<Specialization[]> {
  const res = await api.get('/specializations', {
    params: fieldOfStudyId ? { fieldOfStudyId } : undefined,
  });
  return res.data.data;
}

export async function createSpecialization(input: {
  name: string;
  shortName: string;
  fieldOfStudyId: string;
}): Promise<Specialization> {
  const res = await api.post('/specializations', input);
  return res.data.data;
}

export async function deleteSpecialization(id: string): Promise<void> {
  await api.delete(`/specializations/${id}`);
}
