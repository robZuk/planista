import type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { isUniqueConstraintError, isNotFoundError, isForeignKeyError } from '../lib/prismaErrors';

/**
 * Jedyne miejsce, gdzie blad zamienia sie na odpowiedz HTTP. Kolejnosc rozpoznawania:
 * walidacja (zod) -> 400, jawny AppError -> jego status, znane bledy Prisma -> 409/404,
 * reszta -> 500. Bledy oczekiwane (4xx) to normalny przeplyw i ich nie logujemy jako error;
 * dopiero NIEobsluzony 500 leci do loggera ze stackiem i request-id (req.log od pino-http).
 *
 * Express rozpoznaje handler bledow po 4 argumentach (err, req, res, next) — dlatego
 * `next` musi tu byc na liscie, mimo ze go nie wolujemy.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    // Pierwszy problem wystarcza klientowi; sciezka pola dla czytelnosci ("email: ...").
    const first = err.issues[0];
    const path = first?.path.join('.');
    res.status(400).json({ error: path ? `${path}: ${first.message}` : (first?.message ?? 'Nieprawidlowe dane') });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (isUniqueConstraintError(err)) {
    res.status(409).json({ error: 'Rekord o podanych danych juz istnieje' });
    return;
  }
  if (isNotFoundError(err)) {
    res.status(404).json({ error: 'Rekord nie znaleziony' });
    return;
  }
  if (isForeignKeyError(err)) {
    res.status(409).json({ error: 'Rekord jest jeszcze uzywany przez inne dane' });
    return;
  }
  // req.log (child logger z pino-http) niesie request-id; poza cyklem zadania fallback na logger.
  const log: Logger = (req as unknown as { log?: Logger }).log ?? logger;
  log.error({ err }, 'Nieobsluzony blad serwera');
  res.status(500).json({ error: 'Blad serwera' });
}
