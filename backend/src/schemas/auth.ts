import { z } from 'zod';

/** POST /api/auth/login */
export const loginSchema = z.object({
  email: z.email('Nieprawidlowy adres email'),
  password: z.string().min(1, 'Haslo jest wymagane'),
});

/** POST /api/auth/refresh, /api/auth/logout */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Wymagane pole: refreshToken'),
});
