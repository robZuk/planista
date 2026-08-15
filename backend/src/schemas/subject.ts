import { z } from 'zod';

export const subjectCreateSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana'),
  code: z.string().optional(),
});
