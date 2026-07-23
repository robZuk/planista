import { api } from '@/lib/api';
import type { TimeBlock } from '@/types';

export async function fetchTimeBlocks(): Promise<TimeBlock[]> {
  const res = await api.get('/time-blocks');
  return res.data.data;
}

/**
 * Backend przyjmuje tylko godzine startu (pelna godzina "HH:00"), sam wylicza
 * koniec i przelicza `order` wszystkich blokow — dlatego nie ma tu update().
 */
export async function createTimeBlock(startTime: string): Promise<TimeBlock> {
  const res = await api.post('/time-blocks', { startTime });
  return res.data.data;
}

export async function deleteTimeBlock(id: string): Promise<void> {
  await api.delete(`/time-blocks/${id}`);
}
