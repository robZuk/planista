import { Router } from 'express';
import { getAll, create, update, remove, impersonate } from '../controllers/users.controller';
import { authenticate, authorize } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { userCreateSchema, userUpdateSchema } from '../schemas/user';

const router = Router();

// Zarzadzanie kontami i impersonacja — wylacznie ADMIN.
router.get('/', authenticate, authorize('ADMIN'), getAll);
router.post('/', authenticate, authorize('ADMIN'), validateBody(userCreateSchema), create);
router.put('/:id', authenticate, authorize('ADMIN'), validateBody(userUpdateSchema), update);
router.delete('/:id', authenticate, authorize('ADMIN'), remove);
router.post('/:id/impersonate', authenticate, authorize('ADMIN'), impersonate);

export default router;
