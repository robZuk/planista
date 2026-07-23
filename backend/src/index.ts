import 'dotenv/config';
import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
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
  app.listen(port, () => {
    console.log(`[planista7] Backend nasluchuje na http://localhost:${port}`);
  });
}
