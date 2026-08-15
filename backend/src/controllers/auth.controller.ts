import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TTL_MS,
} from '../lib/jwt';
import bcrypt from 'bcryptjs';

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

/** POST /api/auth/login  { email, password } — walidacja w validateBody(loginSchema). */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await findUserWithRelations({ email });
  // Ten sam komunikat dla zlego emaila i zlego hasla — nie zdradzamy, co bylo nie tak.
  if (!user || !bcrypt.compareSync(password, user.password)) {
    throw new AppError(401, 'Nieprawidlowy email lub haslo');
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
});

/** POST /api/auth/refresh  { refreshToken } — walidacja w validateBody(refreshSchema). */
export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string };

  // 1) Podpis i termin waznosci (JWT).
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Refresh token niewazny lub wygasly');
  }

  // 2) Czy token istnieje w bazie (czy nie zostal uniewazniony przez logout).
  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError(401, 'Refresh token uniewazniony');
  }

  // 3) Aktualna rola z bazy (mogla sie zmienic) -> nowy access token.
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new AppError(401, 'Uzytkownik nie istnieje');
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  res.json({ data: { accessToken } });
});

/** POST /api/auth/logout  { refreshToken } — uniewaznia refresh token (tolerancyjny). */
export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };
  if (typeof refreshToken === 'string') {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }
  res.json({ data: { message: 'Wylogowano' } });
});

/** GET /api/auth/me — dane zalogowanego uzytkownika (wymaga authenticate). */
export const me = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AppError(401, 'Wymagane uwierzytelnienie');
  }
  const user = await findUserWithRelations({ id: req.user.id });
  if (!user) {
    throw new AppError(404, 'Uzytkownik nie istnieje');
  }
  res.json({ data: { user: toPublicUser(user) } });
});
