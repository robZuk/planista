import { Router } from 'express';
import {
  getAll,
  getOne,
  create,
  update,
  remove,
  getRooms,
  createRoom,
  updateRoom,
  removeRoom,
} from '../controllers/buildings.controller';
import { authenticate, authorize } from '../middleware/authenticate';

const router = Router();

const canView = authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR');
const canEdit = authorize('ADMIN');

router.get('/', authenticate, canView, getAll);
router.get('/:id', authenticate, canView, getOne);
router.post('/', authenticate, canEdit, create);
router.put('/:id', authenticate, canEdit, update);
router.delete('/:id', authenticate, canEdit, remove);

router.get('/:id/rooms', authenticate, canView, getRooms);
router.post('/:id/rooms', authenticate, canEdit, createRoom);
router.put('/:id/rooms/:roomId', authenticate, canEdit, updateRoom);
router.delete('/:id/rooms/:roomId', authenticate, canEdit, removeRoom);

export default router;
