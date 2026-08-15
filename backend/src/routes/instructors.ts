import { Router } from 'express';
import { getAll, getOne, create, update, remove } from '../controllers/instructors.controller';
import { authenticate, authorize } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { instructorCreateSchema, instructorUpdateSchema } from '../schemas/instructor';

const router = Router();

const canView = authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR');
const canEdit = authorize('ADMIN');

router.get('/', authenticate, canView, getAll);
router.get('/:id', authenticate, canView, getOne);
router.post('/', authenticate, canEdit, validateBody(instructorCreateSchema), create);
router.put('/:id', authenticate, canEdit, validateBody(instructorUpdateSchema), update);
router.delete('/:id', authenticate, canEdit, remove);

export default router;
