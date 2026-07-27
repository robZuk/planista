import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TTL_MS,
} from '../lib/jwt';

/**
 * Ksztalt uzytkownika zwracany na zewnatrz — BEZ hasla.
 * `include` musi zawierac instructor i studentGroups.
 */
type UserWithRelations = Awaited<ReturnType<typeof findUserWithRelations>>;

function findUserWithRelations(where: { id: string } | { email: string }) {
  return prisma.user.findUnique({
    where: where as never,
    include: {
      instructor: true,
      studentGroups: { select: { id: true, name: true } },
    },
  });
}

function toPublicUser(user: NonNullable<UserWithRelations>) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    instructorId: user.instructorId,
    facultyId: user.facultyId,
    studentGroups: user.studentGroups, // [{ id, name }]
  };
}

/** POST /api/auth/login  { email, password } */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Wymagane pola: email, password' });
      return;
    }

    const user = await findUserWithRelations({ email });
    // Ten sam komunikat dla zlego emaila i zlego hasla — nie zdradzamy, co bylo nie tak.
    if (!user || !bcrypt.compareSync(password, user.password)) {
      res.status(401).json({ error: 'Nieprawidlowy email lub haslo' });
      return;
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id });

    // Zapis refresh tokenu w bazie (mozliwosc uniewaznienia).
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    res.json({ data: { accessToken, refreshToken, user: toPublicUser(user) } });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

/** POST /api/auth/refresh  { refreshToken } */
export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== 'string') {
      res.status(400).json({ error: 'Wymagane pole: refreshToken' });
      return;
    }

    // 1) Podpis i termin waznosci (JWT).
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      res.status(401).json({ error: 'Refresh token niewazny lub wygasly' });
      return;
    }

    // 2) Czy token istnieje w bazie (czy nie zostal uniewazniony przez logout).
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      res.status(401).json({ error: 'Refresh token uniewazniony' });
      return;
    }

    // 3) Aktualna rola z bazy (mogla sie zmienic) -> nowy access token.
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      res.status(401).json({ error: 'Uzytkownik nie istnieje' });
      return;
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    res.json({ data: { accessToken } });
  } catch (err) {
    console.error('refresh error', err);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

/** POST /api/auth/logout  { refreshToken } — uniewaznia refresh token. */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken === 'string') {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.json({ data: { message: 'Wylogowano' } });
  } catch (err) {
    console.error('logout error', err);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

/** GET /api/auth/me — dane zalogowanego uzytkownika (wymaga authenticate). */
export async function me(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Wymagane uwierzytelnienie' });
      return;
    }
    const user = await findUserWithRelations({ id: req.user.id });
    if (!user) {
      res.status(404).json({ error: 'Uzytkownik nie istnieje' });
      return;
    }
    res.json({ data: { user: toPublicUser(user) } });
  } catch (err) {
    console.error('me error', err);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
