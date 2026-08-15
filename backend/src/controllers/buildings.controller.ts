import type { RoomType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';

// ─── Budynki ─────────────────────────────────────────────────

export const getAll = asyncHandler(async (_req, res) => {
  const data = await prisma.building.findMany({
    include: { faculty: true, rooms: true },
    orderBy: { name: 'asc' },
  });
  res.json({ data });
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await prisma.building.findUnique({
    where: { id: req.params.id },
    include: { faculty: true, rooms: true },
  });
  if (!data) throw new AppError(404, 'Budynek nie znaleziony');
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const { name, address, facultyId } = req.body as {
    name: string;
    address?: string;
    facultyId?: string;
  };
  const data = await prisma.building.create({ data: { name, address, facultyId } });
  res.status(201).json({ data, message: 'Budynek utworzony' });
});

export const update = asyncHandler(async (req, res) => {
  const { name, address, facultyId } = req.body as {
    name?: string;
    address?: string;
    facultyId?: string;
  };
  const data = await prisma.building.update({
    where: { id: req.params.id },
    data: { name, address, facultyId },
  });
  res.json({ data, message: 'Budynek zaktualizowany' });
});

export const remove = asyncHandler(async (req, res) => {
  const building = await prisma.building.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { rooms: true } } },
  });
  if (!building) throw new AppError(404, 'Budynek nie znaleziony');
  if (building._count.rooms > 0) throw new AppError(409, 'Usun najpierw wszystkie sale w budynku');
  await prisma.building.delete({ where: { id: req.params.id } });
  res.json({ message: 'Budynek usuniety' });
});

// ─── Sale ────────────────────────────────────────────────────

export const getRooms = asyncHandler(async (req, res) => {
  const data = await prisma.room.findMany({
    where: { buildingId: req.params.id },
    orderBy: { number: 'asc' },
  });
  res.json({ data });
});

export const createRoom = asyncHandler(async (req, res) => {
  const { number, type, capacity } = req.body as {
    number: string;
    type: RoomType;
    capacity: number;
  };
  const data = await prisma.room.create({
    data: { number, type, capacity, buildingId: req.params.id },
  });
  res.status(201).json({ data, message: 'Sala utworzona' });
});

export const updateRoom = asyncHandler(async (req, res) => {
  const { number, type, capacity } = req.body as {
    number?: string;
    type?: RoomType;
    capacity?: number;
  };
  const data = await prisma.room.update({
    where: { id: req.params.roomId },
    data: { number, type, capacity },
  });
  res.json({ data, message: 'Sala zaktualizowana' });
});

export const removeRoom = asyncHandler(async (req, res) => {
  const room = await prisma.room.findUnique({
    where: { id: req.params.roomId },
    include: { _count: { select: { templateEntries: true, scheduleEntries: true } } },
  });
  if (!room) throw new AppError(404, 'Sala nie znaleziona');
  if (room._count.templateEntries > 0 || room._count.scheduleEntries > 0) {
    throw new AppError(409, 'Nie mozna usunac sali przypisanej do planu zajec');
  }
  await prisma.room.delete({ where: { id: req.params.roomId } });
  res.json({ message: 'Sala usunieta' });
});
