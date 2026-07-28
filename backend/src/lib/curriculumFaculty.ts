import { prisma } from './prisma';

/**
 * Wydzial wpisu siatki: CurriculumEntry -> CurriculumVersion -> Specialization
 * -> FieldOfStudy.facultyId. Wszystkie klucze po drodze sa wymagane, wiec dla
 * istniejacego wpisu wynik zawsze istnieje; null oznacza, ze wpisu nie ma.
 *
 * Wzorce i terminy dostaja facultyId WYLACZNIE stad — klient go nie podaje,
 * dzieki czemu przynaleznosc do wydzialu nie moze sie rozjechac z siatka.
 */
export async function resolveFacultyId(curriculumEntryId: string): Promise<string | null> {
  const entry = await prisma.curriculumEntry.findUnique({
    where: { id: curriculumEntryId },
    select: {
      curriculumVersion: {
        select: { specialization: { select: { fieldOfStudy: { select: { facultyId: true } } } } },
      },
    },
  });
  return entry?.curriculumVersion.specialization.fieldOfStudy.facultyId ?? null;
}
