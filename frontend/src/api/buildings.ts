import { api } from '@/lib/api';
import type { Building, Room, RoomType } from '@/types';

export interface BuildingInput {
  name: string;
  address?: string;
  facultyId?: string;
}

export interface RoomInput {
  number: string;
  type: RoomType;
  capacity: number;
}

export async function fetchBuildings(): Promise<Building[]> {
  const res = await api.get('/buildings');
  return res.data.data;
}

export async function createBuilding(input: BuildingInput): Promise<Building> {
  const res = await api.post('/buildings', input);
  return res.data.data;
}

export async function updateBuilding(id: string, input: BuildingInput): Promise<Building> {
  const res = await api.put(`/buildings/${id}`, input);
  return res.data.data;
}

export async function deleteBuilding(id: string): Promise<void> {
  await api.delete(`/buildings/${id}`);
}

export async function createRoom(buildingId: string, input: RoomInput): Promise<Room> {
  const res = await api.post(`/buildings/${buildingId}/rooms`, input);
  return res.data.data;
}

export async function updateRoom(
  buildingId: string,
  roomId: string,
  input: RoomInput,
): Promise<Room> {
  const res = await api.put(`/buildings/${buildingId}/rooms/${roomId}`, input);
  return res.data.data;
}

export async function deleteRoom(buildingId: string, roomId: string): Promise<void> {
  await api.delete(`/buildings/${buildingId}/rooms/${roomId}`);
}
