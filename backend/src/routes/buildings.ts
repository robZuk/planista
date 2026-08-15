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
import { validateBody } from '../middleware/validate';
import {
  buildingCreateSchema,
  buildingUpdateSchema,
  roomCreateSchema,
  roomUpdateSchema,
} from '../schemas/building';

const router = Router();

const canView = authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR');
const canEdit = authorize('ADMIN');

router.get('/', authenticate, canView, getAll);
router.get('/:id', authenticate, canView, getOne);
router.post('/', authenticate, canEdit, validateBody(buildingCreateSchema), create);
router.put('/:id', authenticate, canEdit, validateBody(buildingUpdateSchema), update);
router.delete('/:id', authenticate, canEdit, remove);

router.get('/:id/rooms', authenticate, canView, getRooms);
router.post('/:id/rooms', authenticate, canEdit, validateBody(roomCreateSchema), createRoom);
router.put('/:id/rooms/:roomId', authenticate, canEdit, validateBody(roomUpdateSchema), updateRoom);
router.delete('/:id/rooms/:roomId', authenticate, canEdit, removeRoom);

export default router;
