import { api } from '@/lib/api';
import type { Role, User, UserListItem } from '@/types';

export interface UserInput {
  name: string;
  email: string;
  role: Role;
  /** Wymagane przy tworzeniu, opcjonalne przy edycji (pusty = bez zmiany). */
  password?: string;
  instructorId?: string | null;
  /** Wydzial dziekanatu — istotny tylko dla roli DEAN_OFFICE. */
  facultyId?: string | null;
  studentGroupIds?: string[];
}

export async function fetchUsers(): Promise<UserListItem[]> {
  const res = await api.get('/users');
  return res.data.data;
}

export async function createUser(input: UserInput): Promise<UserListItem> {
  const res = await api.post('/users', input);
  return res.data.data;
}

export async function updateUser(id: string, input: UserInput): Promise<UserListItem> {
  const res = await api.put(`/users/${id}`, input);
  return res.data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

export interface ImpersonateResult {
  accessToken: string;
  user: User;
}

/** Zwraca krotki (2h) token podgladowy wystawiony na wskazane konto. */
export async function impersonateUser(id: string): Promise<ImpersonateResult> {
  const res = await api.post(`/users/${id}/impersonate`);
  return res.data.data;
}
