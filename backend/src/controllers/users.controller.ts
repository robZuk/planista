import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';
import { signAccessToken } from '../lib/jwt';

/**
 * Zarzadzanie kontami (tylko ADMIN) + impersonacja.
 *
 * Impersonacja = admin dostaje krotki access token wystawiony na innego
 * uzytkownika, aby zobaczyc system jego oczami (diagnostyka uprawnien/planu).
 * Token niesie tylko { sub, role } — reszta (instructorId, grupy) i tak jest
 * dociagana z bazy po stronie backendu, wiec podszycie sie pod role wystarcza.
 *
 * Walidacja wejscia (pola, format email, min. dlugosc hasla, dozwolone role)
 * jest w validateBody(userCreateSchema/userUpdateSchema) na trasie.
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

// GET /api/users
export const getAll = asyncHandler(async (_req, res) => {
  const data = await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'asc' } });
  res.json({ data });
});

// POST /api/users
export const create = asyncHandler(async (req, res) => {
  const { name, email, password, role, instructorId, studentGroupIds, facultyId } = req.body as {
    name: string;
    email: string;
    password: string;
    role: Role;
    instructorId?: string | null;
    studentGroupIds?: string[];
    facultyId?: string | null;
  };

  const data = await prisma.user.create({
    data: {
      name,
      email,
      password: bcrypt.hashSync(password, 12),
      role,
      instructorId: role === 'INSTRUCTOR' ? instructorId || null : null,
      facultyId: role === 'DEAN_OFFICE' ? facultyId || null : null,
      ...(role === 'STUDENT' && Array.isArray(studentGroupIds)
        ? { studentGroups: { connect: studentGroupIds.map((id) => ({ id })) } }
        : {}),
    },
    select: userSelect,
  });
  res.status(201).json({ data, message: 'Uzytkownik utworzony' });
});

// PUT /api/users/:id
export const update = asyncHandler(async (req, res) => {
  const { name, email, role, instructorId, studentGroupIds, password, facultyId } = req.body as {
    name?: string;
    email?: string;
    role?: Role;
    instructorId?: string | null;
    studentGroupIds?: string[];
    password?: string;
    facultyId?: string | null;
  };

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
        ? { studentGroups: { set: studentGroupIds.map((id) => ({ id })) } }
        : {}),
      ...(password ? { password: bcrypt.hashSync(password, 12) } : {}),
    },
    select: userSelect,
  });
  res.json({ data, message: 'Uzytkownik zaktualizowany' });
});

// DELETE /api/users/:id
export const remove = asyncHandler(async (req, res) => {
  if (req.user?.id === req.params.id) {
    throw new AppError(400, 'Nie mozesz usunac wlasnego konta');
  }
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ message: 'Uzytkownik usuniety' });
});

// POST /api/users/:id/impersonate
export const impersonate = asyncHandler(async (req, res) => {
  if (req.user?.id === req.params.id) {
    throw new AppError(400, 'Nie mozesz podszyc sie pod samego siebie');
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
  if (!target) throw new AppError(404, 'Uzytkownik nie znaleziony');

  // Krotki token (2h) — sesja podgladowa, nieodnawialna (brak refresh tokenu).
  const accessToken = signAccessToken({ sub: target.id, role: target.role }, '2h');
  res.json({ data: { accessToken, user: target } });
});
