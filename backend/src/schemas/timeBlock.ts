import { z } from 'zod';

// Sam format godziny (HH:00) sprawdza kontroler przez isValidHour — tu tylko obecnosc.
export const timeBlockCreateSchema = z.object({
  startTime: z.string().min(1, 'Pole startTime jest wymagane'),
});
