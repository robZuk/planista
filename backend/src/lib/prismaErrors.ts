/**
 * Rozpoznawanie typowych bledow Prisma po kodzie, zeby kontrolery mogly
 * zwracac wlasciwy status HTTP (409 duplikat, 404 nie znaleziono, 409 relacja).
 * https://www.prisma.io/docs/reference/api-reference/error-reference
 */

// P2002 — naruszenie unikalnosci (duplikat)
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}

// P2025 — rekord nie znaleziony (np. update/delete na nieistniejacym id)
export function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2025'
  );
}

// P2003 — naruszenie klucza obcego (rekord jest jeszcze gdzies uzywany)
export function isForeignKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2003'
  );
}
