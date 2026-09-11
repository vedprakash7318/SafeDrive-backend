import express from 'express';
import { dealerLogin, sendDealerLoginOTP, getAssignedQRs, activateQR, sendDealerOTP, verifyDealerOTP } from '../controllers/dealerController.js';
import { getActiveProducts, placeOrder, getPartnerSettings, verifyPartnerPayment, getMyOrders } from '../controllers/partnerController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/send-login-otp', sendDealerLoginOTP);
router.post('/login', dealerLogin);

router.use(protect);

router.get('/qrs', getAssignedQRs);
router.post('/qrs/send-otp', sendDealerOTP);
router.post('/qrs/verify-otp', verifyDealerOTP);
router.post('/qrs/activate', activateQR);

// Partner Bulk Orders
router.get('/settings', getPartnerSettings);
router.get('/partner-products', getActiveProducts);
router.get('/partner-orders', getMyOrders);
router.post('/partner-orders', placeOrder);
router.post('/partner-orders/verify', verifyPartnerPayment);

export default router;