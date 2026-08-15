import { z } from 'zod';

const role = z.enum(['ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT'], {
  error: 'Nieprawidlowa rola',
});

export const userCreateSchema = z.object({
  name: z.string().min(1, 'Imie i nazwisko sa wymagane'),
  email: z.email('Nieprawidlowy adres email'),
  // Minimalna dlugosc hasla wymuszona juz na wejsciu API (nie tylko na froncie).
  password: z.string().min(8, 'Haslo musi miec min. 8 znakow'),
  role,
  instructorId: z.string().nullish(),
  facultyId: z.string().nullish(),
  studentGroupIds: z.array(z.string()).optional(),
});

// Aktualizacja czesciowa — kazde pole opcjonalne, ale np. haslo (gdy podane)
// nadal musi spelniac min. 8 znakow.
export const userUpdateSchema = userCreateSchema.partial();
