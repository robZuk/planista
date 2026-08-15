import { z } from 'zod';

export const fieldOfStudyCreateSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana'),
  shortName: z.string().min(1, 'Skrot jest wymagany'),
  facultyId: z.string().min(1, 'Wydzial jest wymagany'),
});
