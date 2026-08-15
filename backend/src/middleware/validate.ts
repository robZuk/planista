import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

/**
 * Walidacja ciala zadania (req.body) schematem zod. Po sukcesie podmienia req.body
 * na sparsowana wartosc (odrzucone nadmiarowe pola, wymuszony typ). Blad zod jest
 * rzucany synchronicznie — Express przekaze go do errorHandler, ktory zwroci 400.
 *
 * Uzycie na trasie zapisu:
 *   router.post('/', authenticate, authorize('ADMIN'), validateBody(facultyCreateSchema), create)
 */
export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
}
