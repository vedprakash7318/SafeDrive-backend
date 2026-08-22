import express from 'express';
import {
  getQRInfoByToken,
  claimPhysicalQR,
  verifyPlateLast4Digits,
  registerQR,
  initiateCall,
  initiateMessage,
  triggerEmergency,
  getPublicScanReasons,
  sendActivationOTP,
  verifyActivationOTP
} from '../controllers/publicController.js';

const router = express.Router();

router.get('/scan-reasons', getPublicScanReasons);
router.get('/qr/:token', getQRInfoByToken);
router.post('/send-activation-otp', sendActivationOTP);
router.post('/verify-activation-otp', verifyActivationOTP);
router.post('/qr/:token/claim', claimPhysicalQR);
router.post('/qr/:token/verify-plate', verifyPlateLast4Digits);
router.post('/qr/:token/register', registerQR);
router.post('/qr/:token/call', initiateCall);
router.post('/qr/:token/message', initiateMessage);
router.post('/qr/:token/emergency', triggerEmergency);

export default router;
