import { api } from '@/lib/api';
import type { User } from '@/types';

export interface LoginResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export async function loginRequest(email: string, password: string): Promise<LoginResult> {
  const res = await api.post('/auth/login', { email, password });
  return res.data.data;
}

export async function logoutRequest(refreshToken: string): Promise<void> {
  await api.post('/auth/logout', { refreshToken });
}

export async function fetchMe(): Promise<User> {
  const res = await api.get('/auth/me');
  return res.data.data.user;
}
