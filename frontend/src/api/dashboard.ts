import { api } from '@/lib/api';
import type { DashboardStats } from '@/types';

/** Jeden endpoint dla wszystkich rol — o tym, co widzi dana rola, decyduje frontend. */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await api.get('/dashboard/stats');
  return res.data.data;
}
