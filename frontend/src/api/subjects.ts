import { api } from '@/lib/api';
import type { Subject } from '@/types';

export async function fetchSubjects(search?: string): Promise<Subject[]> {
  const res = await api.get('/subjects', { params: search ? { search } : undefined });
  return res.data.data;
}

export async function createSubject(input: { name: string; code?: string }): Promise<Subject> {
  const res = await api.post('/subjects', input);
  return res.data.data;
}

export async function deleteSubject(id: string): Promise<void> {
  await api.delete(`/subjects/${id}`);
}
