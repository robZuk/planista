import { Router } from 'express';
import {
  getAcademicYears,
  getVersions,
  createVersion,
  updateVersion,
  deleteVersion,
  getEntries,
  addEntry,
  updateEntry,
  deleteEntry,
} from '../controllers/curriculum.controller';
import { authenticate, authorize } from '../middleware/authenticate';

const router = Router();

const canView = authorize('ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT');
const canEdit = authorize('ADMIN');

router.get('/academic-years', authenticate, canView, getAcademicYears);
router.get('/versions', authenticate, canView, getVersions);
router.post('/versions', authenticate, canEdit, createVersion);
router.put('/versions/:id', authenticate, canEdit, updateVersion);
router.delete('/versions/:id', authenticate, canEdit, deleteVersion);

router.get('/versions/:id/entries', authenticate, canView, getEntries);
router.post('/versions/:id/entries', authenticate, canEdit, addEntry);
router.put('/entries/:id', authenticate, canEdit, updateEntry);
router.delete('/entries/:id', authenticate, canEdit, deleteEntry);

export default router;
