import express from 'express';
import {
  getDashboard,
  buyQuota,
  sendRenewalOTP,
  createRenewalOrder,
  renewSubscription,
  updateEmergencyContacts,
  getLedger,
  activatePurchasedQR,
  getUserOrders,
  getUserPackages,
  updateProfile,
  getQRDetails,
  updateUserQRDetails,
  getUserNotifications,
  markNotificationRead,
  registerFCMToken
} from '../controllers/userController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/dashboard', getDashboard);
router.post('/fcm-token', registerFCMToken);
router.get('/notifications', getUserNotifications);
router.put('/notifications/:id/read', markNotificationRead);
router.get('/packages', getUserPackages);
router.put('/profile', updateProfile);
router.post('/qr/activate', activatePurchasedQR);
router.get('/qr/:id', getQRDetails);
router.put('/qr/:id/details', updateUserQRDetails);
router.get('/orders', getUserOrders);
router.post('/quota/buy', buyQuota);
router.post('/subscription/send-otp', sendRenewalOTP);
router.post('/subscription/create-order', createRenewalOrder);
router.post('/subscription/renew', renewSubscription);
router.put('/emergency-contacts', updateEmergencyContacts);
router.get('/ledger', getLedger);

export default router;
