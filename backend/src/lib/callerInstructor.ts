import { prisma } from './prisma';

/**
 * Zwraca instructorId powiazany z kontem uzytkownika (lub null, jesli konto nie jest
 * powiazane z rekordem prowadzacego). Access token niesie tylko { id, role }, wiec
 * ownership prowadzacego doczytujemy z bazy przy operacjach na planie.
 */
export async function getCallerInstructorId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { instructorId: true } });
  return user?.instructorId ?? null;
}
