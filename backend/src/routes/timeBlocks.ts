import { Router } from 'express';
import { getAll, create, remove } from '../controllers/timeBlocks.controller';
import { authenticate, authorize } from '../middleware/authenticate';

const router = Router();

router.get('/', authenticate, authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR'), getAll);
router.post('/', authenticate, authorize('ADMIN'), create);
router.delete('/:id', authenticate, authorize('ADMIN'), remove);

export default router;
