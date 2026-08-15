import { Router } from 'express';
import { getAll, create, remove } from '../controllers/timeBlocks.controller';
import { authenticate, authorize } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { timeBlockCreateSchema } from '../schemas/timeBlock';

const router = Router();

router.get('/', authenticate, authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR'), getAll);
router.post('/', authenticate, authorize('ADMIN'), validateBody(timeBlockCreateSchema), create);
router.delete('/:id', authenticate, authorize('ADMIN'), remove);

export default router;
