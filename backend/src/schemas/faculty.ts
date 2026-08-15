import { z } from 'zod';

export const facultyCreateSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana'),
  shortName: z.string().min(1, 'Skrot jest wymagany'),
});

// Aktualizacja czesciowa — dowolne z pol (Prisma pomija undefined).
export const facultyUpdateSchema = facultyCreateSchema.partial();
