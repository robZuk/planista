import { z } from 'zod';

export const publicHolidayCreateSchema = z.object({
  // Data jako ISO string — kontroler zamienia na Date.
  date: z.string().min(1, 'Data jest wymagana'),
  name: z.string().min(1, 'Nazwa jest wymagana'),
});
