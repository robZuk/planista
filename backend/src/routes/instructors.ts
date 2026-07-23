import { Router } from 'express';
import { getAll, getOne, create, update, remove } from '../controllers/instructors.controller';
import { authenticate, authorize } from '../middleware/authenticate';

const router = Router();

const canView = authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR');
const canEdit = authorize('ADMIN');

router.get('/', authenticate, canView, getAll);
router.get('/:id', authenticate, canView, getOne);
router.post('/', authenticate, canEdit, create);
router.put('/:id', authenticate, canEdit, update);
router.delete('/:id', authenticate, canEdit, remove);

export default router;
