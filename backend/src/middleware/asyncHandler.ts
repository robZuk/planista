import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Opakowuje asynchroniczny handler tak, aby rzucony wyjatek (lub odrzucony Promise)
 * trafil do next() — Express sam nie lapie bledow z funkcji async. Bez tego
 * nieobsluzony rzut w async handlerze wieszalby zadanie zamiast dac odpowiedz 500.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
