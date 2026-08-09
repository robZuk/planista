import { Router } from 'express';
import { getAll, getOne, copyToNextYear, createOne, update, remove, removeAll } from '../controllers/groups.controller';
import { authenticate, authorize } from '../middleware/authenticate';

const router = Router();

// Odczyt — wszyscy zalogowani (dane grup przydatne tez poza widokiem Grupy, np. plan zajec)
router.get('/', authenticate, getAll);
router.get('/:id', authenticate, getOne);

// Tworzenie i edycja — tylko ADMIN
router.post('/copy-to-next-year', authenticate, authorize('ADMIN'), copyToNextYear);
router.post('/', authenticate, authorize('ADMIN'), createOne);
router.put('/:id', authenticate, authorize('ADMIN'), update);
router.delete('/', authenticate, authorize('ADMIN'), removeAll);
router.delete('/:id', authenticate, authorize('ADMIN'), remove);

export default router;
