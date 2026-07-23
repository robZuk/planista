import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate';
import * as templates from '../controllers/scheduleTemplate.controller';
import * as generator from '../controllers/scheduleGenerator.controller';
import * as entries from '../controllers/scheduleEntry.controller';
import * as calendars from '../controllers/semesterCalendar.controller';
import * as holidays from '../controllers/publicHoliday.controller';

const router = Router();

const viewAll = authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT');
const planners = authorize('ADMIN', 'DEAN_OFFICE'); // zarzadzanie kalendarzem/generatorem
const editors = authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR'); // wzorce i terminy (INSTRUCTOR = wlasne)

// ─── Wzorce tygodnia ─────────────────────────────────────────
router.get('/templates', authenticate, authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR'), templates.getAll);
router.post('/templates', authenticate, editors, templates.create);
router.put('/templates/:id', authenticate, editors, templates.update);
router.delete('/templates/:id', authenticate, editors, templates.remove);
router.get('/templates/summary/:curriculumVersionId', authenticate, viewAll, templates.getSummary);

// ─── Generator terminow ──────────────────────────────────────
router.post('/generate', authenticate, planners, generator.generateSemester);

// ─── Terminy (kalendarz semestru) ────────────────────────────
router.get('/entries', authenticate, viewAll, entries.getAll);
router.post('/entries', authenticate, editors, entries.create);
router.put('/entries/:id/status', authenticate, editors, entries.updateStatus);
router.post('/entries/:id/move', authenticate, editors, entries.move);
router.delete('/entries/:id', authenticate, editors, entries.remove);

// ─── Kalendarz semestru ──────────────────────────────────────
router.get('/calendars', authenticate, viewAll, calendars.getAll);
router.post('/calendars', authenticate, planners, calendars.create);
router.put('/calendars/:id', authenticate, planners, calendars.update);
router.delete('/calendars/:id', authenticate, planners, calendars.remove);

// ─── Dni wolne ───────────────────────────────────────────────
router.get('/holidays', authenticate, viewAll, holidays.getAll);
router.post('/holidays', authenticate, planners, holidays.create);
router.delete('/holidays/:id', authenticate, planners, holidays.remove);

export default router;
