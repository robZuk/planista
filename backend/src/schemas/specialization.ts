import { z } from 'zod';

export const specializationCreateSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana'),
  shortName: z.string().min(1, 'Skrot jest wymagany'),
  fieldOfStudyId: z.string().min(1, 'Kierunek jest wymagany'),
});
