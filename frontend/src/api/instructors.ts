import { api } from '@/lib/api';
import type { Instructor } from '@/types';

export interface InstructorInput {
  firstName: string;
  lastName: string;
  email: string;
  title?: string;
  facultyId?: string;
}

export async function fetchInstructors(): Promise<Instructor[]> {
  const res = await api.get('/instructors');
  return res.data.data;
}

export async function createInstructor(input: InstructorInput): Promise<Instructor> {
  const res = await api.post('/instructors', input);
  return res.data.data;
}

export async function updateInstructor(id: string, input: InstructorInput): Promise<Instructor> {
  const res = await api.put(`/instructors/${id}`, input);
  return res.data.data;
}

export async function deleteInstructor(id: string): Promise<void> {
  await api.delete(`/instructors/${id}`);
}
