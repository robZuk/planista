import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';

/**
 * Obsluga tokenow JWT w jednym miejscu.
 *
 * Dwa tokeny:
 *  - ACCESS (krotki, 24h) — wysylany z kazdym zadaniem w naglowku Authorization.
 *    Niesie minimum: id uzytkownika (sub) i role (do autoryzacji bez zapytania do bazy).
 *  - REFRESH (dlugi, 7d) — sluzy tylko do wymiany na nowy access token. Trzymany
 *    dodatkowo w bazie (tabela RefreshToken), zeby mozna go bylo uniewaznic (logout).
 */

const ACCESS_TTL = '24h';
const REFRESH_TTL = '7d';
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function accessSecret(): string {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('Brak JWT_ACCESS_SECRET w konfiguracji (.env)');
  return s;
}

function refreshSecret(): string {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s) throw new Error('Brak JWT_REFRESH_SECRET w konfiguracji (.env)');
  return s;
}

/** Zawartosc access tokenu. */
export interface AccessPayload {
  sub: string; // id uzytkownika
  role: Role;
}

/** Zawartosc refresh tokenu. */
export interface RefreshPayload {
  sub: string; // id uzytkownika
}

export function signAccessToken(payload: AccessPayload, ttl: string = ACCESS_TTL): string {
  return jwt.sign(payload, accessSecret(), { expiresIn: ttl } as jwt.SignOptions);
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, refreshSecret(), { expiresIn: REFRESH_TTL });
}

/** Weryfikuje access token; rzuca, jesli niewazny/wygasly. */
export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, accessSecret()) as AccessPayload;
}

/** Weryfikuje refresh token; rzuca, jesli niewazny/wygasly. */
export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, refreshSecret()) as RefreshPayload;
}
