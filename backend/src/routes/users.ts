import { Router } from 'express';
import { getAll, create, update, remove, impersonate } from '../controllers/users.controller';
import { authenticate, authorize } from '../middleware/authenticate';

const router = Router();

// Zarzadzanie kontami i impersonacja — wylacznie ADMIN.
router.get('/', authenticate, authorize('ADMIN'), getAll);
router.post('/', authenticate, authorize('ADMIN'), create);
router.put('/:id', authenticate, authorize('ADMIN'), update);
router.delete('/:id', authenticate, authorize('ADMIN'), remove);
router.post('/:id/impersonate', authenticate, authorize('ADMIN'), impersonate);

export default router;
