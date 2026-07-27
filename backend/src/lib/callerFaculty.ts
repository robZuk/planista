import { prisma } from './prisma';

/**
 * Zwraca facultyId przypisany do konta uzytkownika (lub null, jesli konto nie jest
 * powiazane z wydzialem). Access token niesie tylko { id, role }, wiec przynaleznosc
 * do wydzialu doczytujemy z bazy przy operacjach na planie — tak jak instructorId.
 */
export async function getCallerFacultyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { facultyId: true } });
  return user?.facultyId ?? null;
}
