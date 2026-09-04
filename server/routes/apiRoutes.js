import { Router } from 'express';
import {
  healthCheck,
  getAllRecords,
  getRecordById,
  createRecord,
  bulkImportRecords,
  updateRecord,
  deleteRecord,
} from '../controllers/dataController.js';

const router = Router();

router.get('/health', healthCheck);
router.get('/:table', getAllRecords);
router.get('/:table/:id', getRecordById);
router.post('/:table/import', bulkImportRecords);
router.post('/:table', createRecord);
router.put('/:table/:id', updateRecord);
router.delete('/:table/:id', deleteRecord);

export default router;
