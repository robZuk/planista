import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isNotFoundError, isUniqueConstraintError } from '../lib/prismaErrors';
import { signAccessToken } from '../lib/jwt';

/**
 * Zarzadzanie kontami (tylko ADMIN) + impersonacja.
 *
 * Impersonacja = admin dostaje krotki access token wystawiony na innego
 * uzytkownika, aby zobaczyc system jego oczami (diagnostyka uprawnien/planu).
 * Token niesie tylko { sub, role } — reszta (instructorId, grupy) i tak jest
 * dociagana z bazy po stronie backendu, wiec podszycie sie pod role wystarcza.
 */

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  instructorId: true,
  facultyId: true,
  createdAt: true,
  instructor: { select: { id: true, firstName: true, lastName: true, title: true } },
  studentGroups: { select: { id: true, name: true } },
} as const;

const VALID_ROLES: Role[] = ['ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT'];

// GET /api/users
export async function getAll(_req: Request, res: Response): Promise<void> {
  try {
    const data = await prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// POST /api/users
export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, password, role, instructorId, studentGroupIds, facultyId } = req.body ?? {};

    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !role) {
      res.status(400).json({ error: 'Wymagane pola: name, email, password, role' });
      return;
    }
    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `Nieprawidlowa rola. Dozwolone: ${VALID_ROLES.join(', ')}` });
      return;
    }

    const data = await prisma.user.create({
      data: {
        name,
        email,
        password: bcrypt.hashSync(password, 12),
        role,
        instructorId: role === 'INSTRUCTOR' ? (instructorId || null) : null,
        facultyId: role === 'DEAN_OFFICE' ? (facultyId || null) : null,
        ...(role === 'STUDENT' && Array.isArray(studentGroupIds)
          ? { studentGroups: { connect: studentGroupIds.map((id: string) => ({ id })) } }
          : {}),
      },
      select: userSelect,
    });
    res.status(201).json({ data, message: 'Uzytkownik utworzony' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Uzytkownik z tym emailem (lub powiazaniem z prowadzacym) juz istnieje' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// PUT /api/users/:id
export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, role, instructorId, studentGroupIds, password, facultyId } = req.body ?? {};

    if (role && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `Nieprawidlowa rola. Dozwolone: ${VALID_ROLES.join(', ')}` });
      return;
    }

    // Powiazania sa juz zawezone przez rolę po stronie frontendu
    // (instructorId=null gdy nie-INSTRUCTOR, studentGroupIds=[] gdy nie-STUDENT).
    const data = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(role ? { role } : {}),
        ...(instructorId !== undefined ? { instructorId: instructorId || null } : {}),
        ...(facultyId !== undefined ? { facultyId: facultyId || null } : {}),
        ...(studentGroupIds !== undefined
          ? { studentGroups: { set: (studentGroupIds as string[]).map((id) => ({ id })) } }
          : {}),
        ...(password ? { password: bcrypt.hashSync(password, 12) } : {}),
      },
      select: userSelect,
    });
    res.json({ data, message: 'Uzytkownik zaktualizowany' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Uzytkownik nie znaleziony' });
      return;
    }
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Uzytkownik z tym emailem (lub powiazaniem z prowadzacym) juz istnieje' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// DELETE /api/users/:id
export async function remove(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.id === req.params.id) {
      res.status(400).json({ error: 'Nie mozesz usunac wlasnego konta' });
      return;
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'Uzytkownik usuniety' });
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Uzytkownik nie znaleziony' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

// POST /api/users/:id/impersonate
export async function impersonate(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.id === req.params.id) {
      res.status(400).json({ error: 'Nie mozesz podszyc sie pod samego siebie' });
      return;
    }
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: userSelect,
    });
    if (!target) {
      res.status(404).json({ error: 'Uzytkownik nie znaleziony' });
      return;
    }

    // Krotki token (2h) — sesja podgladowa, nieodnawialna (brak refresh tokenu).
    const accessToken = signAccessToken({ sub: target.id, role: target.role }, '2h');
    res.json({ data: { accessToken, user: target } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
