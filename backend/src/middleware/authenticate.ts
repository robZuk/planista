import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { verifyAccessToken } from '../lib/jwt';

/**
 * Middleware uwierzytelniania.
 * Oczekuje naglowka `Authorization: Bearer <accessToken>`. Po weryfikacji
 * ustawia `req.user = { id, role }`. W razie braku/niewaznosci -> 401.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Brak tokenu uwierzytelniajacego' });
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Token niewazny lub wygasly' });
  }
}

/**
 * Middleware autoryzacji — dopuszcza tylko wskazane role.
 * Uzycie: router.post('/x', authenticate, authorize('ADMIN'), handler)
 * Zaklada, ze `authenticate` uruchomiono wczesniej (jest `req.user`).
 */
export function authorize(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Wymagane uwierzytelnienie' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Brak uprawnien do tej operacji' });
      return;
    }
    next();
  };
}
