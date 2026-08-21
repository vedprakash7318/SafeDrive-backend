import express from 'express';
import {
  getStats,
  generateQRBatch,
  getQRs,
  updateQRStatus,
  adminRenewQR,
  getUsers,
  updateUserStatus,
  getVehicles,
  getEmergencyAlerts,
  getPackages,
  createPackage,
  updatePackage,
  deletePackage,
  restorePackage,
  getSettings,
  updateSettings,
  getTags,
  createTag,
  updateTag,
  deleteTag,
  restoreTag,
  getQRTypes,
  createQRType,
  updateQRType,
  deleteQRType,
  restoreQRType,
  getNextSequenceNumber,
  getScanReasons,
  createScanReason,
  updateScanReason,
  deleteScanReason,
  restoreScanReason
} from '../controllers/adminController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect, adminOnly);

router.get('/stats', getStats);
router.post('/qr/generate', generateQRBatch);
router.get('/qr/next-number', getNextSequenceNumber);
router.get('/qr', getQRs);
router.put('/qr/:id/status', updateQRStatus);
router.post('/qr/:id/renew', adminRenewQR);

router.get('/tags', getTags);
router.post('/tags', createTag);
router.put('/tags/:id', updateTag);
router.delete('/tags/:id', deleteTag);
router.put('/tags/:id/restore', restoreTag);

router.get('/qr-types', getQRTypes);
router.post('/qr-types', createQRType);
router.put('/qr-types/:id', updateQRType);
router.delete('/qr-types/:id', deleteQRType);
router.put('/qr-types/:id/restore', restoreQRType);

router.get('/scan-reasons', getScanReasons);
router.post('/scan-reasons', createScanReason);
router.put('/scan-reasons/:id', updateScanReason);
router.delete('/scan-reasons/:id', deleteScanReason);
router.put('/scan-reasons/:id/restore', restoreScanReason);

router.get('/users', getUsers);
router.put('/users/:id/status', updateUserStatus);
router.get('/vehicles', getVehicles);
router.get('/emergency-alerts', getEmergencyAlerts);

router.get('/packages', getPackages);
router.post('/packages', createPackage);
router.put('/packages/:id', updatePackage);
router.delete('/packages/:id', deletePackage);
router.put('/packages/:id/restore', restorePackage);

router.get('/settings', getSettings);
router.put('/settings', updateSettings);

export default router;
