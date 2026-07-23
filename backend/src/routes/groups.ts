import { Router } from 'express';
import { getAll, getOne, generate, confirm, createOne, update, remove, removeAll } from '../controllers/groups.controller';
import { authenticate, authorize } from '../middleware/authenticate';

const router = Router();

// Odczyt — wszyscy zalogowani (dane grup przydatne tez poza widokiem Grupy, np. plan zajec)
router.get('/', authenticate, getAll);
router.get('/:id', authenticate, getOne);

// Generowanie i edycja — tylko ADMIN
router.post('/generate', authenticate, authorize('ADMIN'), generate);
router.post('/confirm', authenticate, authorize('ADMIN'), confirm);
router.post('/', authenticate, authorize('ADMIN'), createOne);
router.put('/:id', authenticate, authorize('ADMIN'), update);
router.delete('/', authenticate, authorize('ADMIN'), removeAll);
router.delete('/:id', authenticate, authorize('ADMIN'), remove);

export default router;
