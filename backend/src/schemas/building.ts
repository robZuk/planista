import { z } from 'zod';

export const buildingCreateSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana'),
  address: z.string().optional(),
  facultyId: z.string().optional(),
});
export const buildingUpdateSchema = buildingCreateSchema.partial();

export const roomCreateSchema = z.object({
  number: z.string().min(1, 'Numer sali jest wymagany'),
  type: z.enum(['LECTURE', 'EXERCISE', 'LAB', 'COMPUTER_LAB', 'SEMINAR', 'SPORTS'], {
    error: 'Nieprawidlowy typ sali',
  }),
  // Liczba z formularza moze przyjsc jako string — coerce ja przycina do liczby.
  capacity: z.coerce.number().int('Pojemnosc musi byc liczba calkowita').min(0, 'Pojemnosc nie moze byc ujemna'),
});
export const roomUpdateSchema = roomCreateSchema.partial();
