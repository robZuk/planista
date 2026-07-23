import type { Request, Response } from 'express';
import type { RoomType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isUniqueConstraintError, isNotFoundError, isForeignKeyError } from '../lib/prismaErrors';

// ─── Budynki ─────────────────────────────────────────────────

export async function getAll(_req: Request, res: Response): Promise<void> {
  try {
    const data = await prisma.building.findMany({
      include: { faculty: true, rooms: true },
      orderBy: { name: 'asc' },
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const data = await prisma.building.findUnique({
      where: { id: req.params.id },
      include: { faculty: true, rooms: true },
    });
    if (!data) {
      res.status(404).json({ error: 'Budynek nie znaleziony' });
      return;
    }
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, address, facultyId } = req.body as {
      name?: string;
      address?: string;
      facultyId?: string;
    };
    if (!name) {
      res.status(400).json({ error: 'Pole name jest wymagane' });
      return;
    }
    const data = await prisma.building.create({ data: { name, address, facultyId } });
    res.status(201).json({ data, message: 'Budynek utworzony' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Budynek o tej nazwie juz istnieje' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Budynek nie znaleziony' });
      return;
    }
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Nazwa juz zajeta' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const building = await prisma.building.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { rooms: true } } },
    });
    if (!building) {
      res.status(404).json({ error: 'Budynek nie znaleziony' });
      return;
    }
    if (building._count.rooms > 0) {
      res.status(409).json({ error: 'Usun najpierw wszystkie sale w budynku' });
      return;
    }
    await prisma.building.delete({ where: { id: req.params.id } });
    res.json({ message: 'Budynek usuniety' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// ─── Sale ────────────────────────────────────────────────────

export async function getRooms(req: Request, res: Response): Promise<void> {
  try {
    const data = await prisma.room.findMany({
      where: { buildingId: req.params.id },
      orderBy: { number: 'asc' },
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function createRoom(req: Request, res: Response): Promise<void> {
  try {
    const { number, type, capacity } = req.body as {
      number?: string;
      type?: RoomType;
      capacity?: number;
    };
    if (!number || !type || capacity === undefined) {
      res.status(400).json({ error: 'Pola number, type i capacity sa wymagane' });
      return;
    }
    const data = await prisma.room.create({
      data: { number, type, capacity, buildingId: req.params.id },
    });
    res.status(201).json({ data, message: 'Sala utworzona' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Sala o tym numerze juz istnieje w budynku' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function updateRoom(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Sala nie znaleziona' });
      return;
    }
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Numer sali juz zajety' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function removeRoom(req: Request, res: Response): Promise<void> {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.roomId },
      include: { _count: { select: { templateEntries: true, scheduleEntries: true } } },
    });
    if (!room) {
      res.status(404).json({ error: 'Sala nie znaleziona' });
      return;
    }
    if (room._count.templateEntries > 0 || room._count.scheduleEntries > 0) {
      res.status(409).json({ error: 'Nie mozna usunac sali przypisanej do planu zajec' });
      return;
    }
    await prisma.room.delete({ where: { id: req.params.roomId } });
    res.json({ message: 'Sala usunieta' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Sala nie znaleziona' });
      return;
    }
    if (isForeignKeyError(error)) {
      res.status(409).json({ error: 'Nie mozna usunac sali — jest jeszcze uzywana' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
