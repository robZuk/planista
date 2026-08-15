import { z } from 'zod';

export const instructorCreateSchema = z.object({
  firstName: z.string().min(1, 'Imie jest wymagane'),
  lastName: z.string().min(1, 'Nazwisko jest wymagane'),
  email: z.email('Nieprawidlowy adres email'),
  title: z.string().optional(),
  facultyId: z.string().optional(),
});

export const instructorUpdateSchema = instructorCreateSchema.partial();
