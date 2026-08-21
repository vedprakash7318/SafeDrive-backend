import express from 'express';
import {
  getDashboard,
  buyQuota,
  renewSubscription,
  updateEmergencyContacts,
  getLedger
} from '../controllers/userController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/dashboard', getDashboard);
router.post('/quota/buy', buyQuota);
router.post('/subscription/renew', renewSubscription);
router.put('/emergency-contacts', updateEmergencyContacts);
router.get('/ledger', getLedger);

export default router;
