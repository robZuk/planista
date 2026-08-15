import { Router } from 'express';
import { getAll, create, remove } from '../controllers/specializations.controller';
import { authenticate, authorize } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { specializationCreateSchema } from '../schemas/specialization';

const router = Router();

router.get('/', authenticate, authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT'), getAll);
router.post('/', authenticate, authorize('ADMIN'), validateBody(specializationCreateSchema), create);
router.delete('/:id', authenticate, authorize('ADMIN'), remove);

export default router;
