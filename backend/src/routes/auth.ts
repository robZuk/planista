import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, refresh, logout, me } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { loginSchema, refreshSchema } from '../schemas/auth';

const router = Router();

// Ochrona logowania przed zgadywaniem hasla (brute-force): max 10 prob / 15 min / IP.
// Liczymy tylko nieudane proby, zeby udane logowanie nie zblizalo do limitu.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Za duzo prob logowania. Sprobuj ponownie za kilkanascie minut.' },
});

router.post('/login', loginLimiter, validateBody(loginSchema), login);
router.post('/refresh', validateBody(refreshSchema), refresh);
router.post('/logout', logout); // tolerancyjny — brak tokenu tez zwraca 200
router.get('/me', authenticate, me); // tylko zalogowany

export default router;
