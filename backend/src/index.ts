import 'dotenv/config';
import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma';
import authRoutes from './routes/auth';
import facultiesRoutes from './routes/faculties';
import buildingsRoutes from './routes/buildings';
import instructorsRoutes from './routes/instructors';
import timeBlocksRoutes from './routes/timeBlocks';
import fieldsOfStudyRoutes from './routes/fieldsOfStudy';
import specializationsRoutes from './routes/specializations';
import subjectsRoutes from './routes/subjects';
import curriculumRoutes from './routes/curriculum';
import groupsRoutes from './routes/groups';
import scheduleRoutes from './routes/schedule';
import dashboardRoutes from './routes/dashboard';
import usersRoutes from './routes/users';

/**
 * Buduje instancje aplikacji Express wraz z globalnymi middleware i trasami.
 * Wydzielone do funkcji, aby w przyszlosci mozna bylo tworzyc app na potrzeby testow
 * bez faktycznego nasluchiwania na porcie.
 */
export function createApp(): Express {
  const app = express();

  // Za odwrotnym proxy (nginx/edge) — ufamy 1 przeskokowi, zeby req.ip bral
  // prawdziwy adres klienta z X-Forwarded-For. Bez tego rate-limit liczylby
  // wszystkich pod jednym IP proxy. Wartosc 1 (nie `true`) nie pozwala podszyc sie
  // naglowkiem, gdy ruch idzie prosto do backendu.
  app.set('trust proxy', 1);

  // CORS — pozwala frontendowi (inny origin/port) wolac to API.
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5174' }));

  // Parsowanie cial JSON w zadaniach (req.body).
  app.use(express.json());

  // Endpoint zdrowia — sluzy do sprawdzenia, czy serwer zyje.
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ data: { status: 'ok', time: new Date().toISOString() } });
  });

  // API — wszystkie trasy pod prefiksem /api.
  app.use('/api/auth', authRoutes);
  app.use('/api/faculties', facultiesRoutes);
  app.use('/api/buildings', buildingsRoutes);
  app.use('/api/instructors', instructorsRoutes);
  app.use('/api/time-blocks', timeBlocksRoutes);
  app.use('/api/fields-of-study', fieldsOfStudyRoutes);
  app.use('/api/specializations', specializationsRoutes);
  app.use('/api/subjects', subjectsRoutes);
  app.use('/api/curriculum', curriculumRoutes);
  app.use('/api/groups', groupsRoutes);
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/users', usersRoutes);

  return app;
}

// Uruchamiamy serwer tylko gdy plik jest odpalany bezposrednio (a nie importowany w tescie).
if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 4001);
  const server = app.listen(port, () => {
    console.log(`[planista7] Backend nasluchuje na http://localhost:${port}`);
  });

  // Graceful shutdown — na SIGTERM (docker stop) / SIGINT (Ctrl+C) domykamy serwer
  // i rozlaczamy Prisme, zamiast czekac na twardy SIGKILL. Node jako PID 1 ignoruje
  // sygnaly bez jawnego handlera, wiec bez tego kontener stopuje sie dopiero po ~10s.
  const shutdown = (signal: string) => {
    console.log(`[planista7] ${signal} — zamykam serwer...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Bezpiecznik: gdyby polaczenia nie chcialy sie zamknac, konczymy twardo po 8s.
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
