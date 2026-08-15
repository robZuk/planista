import { Router } from 'express';
import { getAll, getOne, create, update, remove } from '../controllers/faculties.controller';
import { authenticate, authorize } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { facultyCreateSchema, facultyUpdateSchema } from '../schemas/faculty';

const router = Router();

router.get('/', authenticate, authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT'), getAll);
router.get('/:id', authenticate, authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT'), getOne);
router.post('/', authenticate, authorize('ADMIN'), validateBody(facultyCreateSchema), create);
router.put('/:id', authenticate, authorize('ADMIN'), validateBody(facultyUpdateSchema), update);
router.delete('/:id', authenticate, authorize('ADMIN'), remove);

export default router;
