import express from 'express';
import multer from 'multer';
import {
  getStats,
  generateQRBatch,
  getQRGroups,
  getQRsByGroup,
  getQRs,
  getQRById,
  updateQRStatus,
  adminRenewQR,
  adminAddAddonQuota,
  getAdminProducts,
  getAdminProductById,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  uploadProductImage,
  getUsers,
  getUserById,
  updateUserStatus,
  getVehicles,
  getEmergencyAlerts,
  getScanLogs,
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
  getQRFormats,
  createQRFormat,
  updateQRFormat,
  deleteQRFormat,
  restoreQRFormat,
  getNextSequenceNumber,
  getScanReasons,
  createScanReason,
  updateScanReason,
  deleteScanReason,
  restoreScanReason,
  getAdminOrders,
  updateAdminOrderStatus,
  getAdminOrderStats
} from '../controllers/adminController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const router = express.Router();

router.use(protect, adminOnly);

router.get('/stats', getStats);
router.post('/qr/generate', generateQRBatch);
router.get('/qr/next-number', getNextSequenceNumber);
router.get('/qr/groups', getQRGroups);
router.get('/qr/group/:groupName', getQRsByGroup);
router.get('/qr', getQRs);
router.get('/qr/:id', getQRById);
router.put('/qr/:id/status', updateQRStatus);
router.post('/qr/:id/renew', adminRenewQR);
router.post('/add-quota', adminAddAddonQuota);

router.get('/products', getAdminProducts);
router.get('/products/:id', getAdminProductById);
router.post('/products/upload-image', upload.single('image'), uploadProductImage);
router.post('/products', createAdminProduct);
router.put('/products/:id', updateAdminProduct);
router.delete('/products/:id', deleteAdminProduct);

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

router.get('/qr-fors', getQRTypes);
router.post('/qr-fors', createQRType);
router.put('/qr-fors/:id', updateQRType);
router.delete('/qr-fors/:id', deleteQRType);
router.put('/qr-fors/:id/restore', restoreQRType);

router.get('/qr-formats', getQRFormats);
router.post('/qr-formats', createQRFormat);
router.put('/qr-formats/:id', updateQRFormat);
router.delete('/qr-formats/:id', deleteQRFormat);
router.put('/qr-formats/:id/restore', restoreQRFormat);

router.get('/scan-reasons', getScanReasons);
router.post('/scan-reasons', createScanReason);
router.put('/scan-reasons/:id', updateScanReason);
router.delete('/scan-reasons/:id', deleteScanReason);
router.put('/scan-reasons/:id/restore', restoreScanReason);

router.get('/orders/stats', getAdminOrderStats);
router.get('/orders', getAdminOrders);
router.patch('/orders/:id/status', updateAdminOrderStatus);

router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id/status', updateUserStatus);
router.get('/vehicles', getVehicles);
router.get('/emergency-alerts', getEmergencyAlerts);
router.get('/scan-logs', getScanLogs);

router.get('/packages', getPackages);
router.post('/packages', createPackage);
router.put('/packages/:id', updatePackage);
router.delete('/packages/:id', deletePackage);
router.put('/packages/:id/restore', restorePackage);

router.get('/settings', getSettings);
router.put('/settings', updateSettings);

export default router;
