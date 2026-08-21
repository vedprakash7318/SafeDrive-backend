import express from 'express';
import {
  getQRInfoByToken,
  verifyPlateLast4Digits,
  registerQR,
  initiateCall,
  initiateMessage,
  triggerEmergency,
  getPublicScanReasons
} from '../controllers/publicController.js';

const router = express.Router();

router.get('/scan-reasons', getPublicScanReasons);
router.get('/qr/:token', getQRInfoByToken);
router.post('/qr/:token/verify-plate', verifyPlateLast4Digits);
router.post('/qr/:token/register', registerQR);
router.post('/qr/:token/call', initiateCall);
router.post('/qr/:token/message', initiateMessage);
router.post('/qr/:token/emergency', triggerEmergency);

export default router;
