import express from 'express';
import {
  getQRInfoByToken,
  claimPhysicalQR,
  verifyPlateLast4Digits,
  registerQR,
  initiateCall,
  initiateMessage,
  sendPushNotification,
  triggerEmergency,
  getPublicScanReasons,
  getLandingPageData,
  subscribeNewsletter,
  submitContactInquiry,
  sendActivationOTP,
  verifyActivationOTP
} from '../controllers/publicController.js';

const router = express.Router();

router.get('/landing-data', getLandingPageData);
router.get('/scan-reasons', getPublicScanReasons);
router.post('/subscribe-newsletter', subscribeNewsletter);
router.post('/contact-inquiry', submitContactInquiry);
router.get('/qr/:token', getQRInfoByToken);
router.post('/send-activation-otp', sendActivationOTP);
router.post('/verify-activation-otp', verifyActivationOTP);
router.post('/qr/:token/claim', claimPhysicalQR);
router.post('/qr/:token/verify-plate', verifyPlateLast4Digits);
router.post('/qr/:token/register', registerQR);
router.post('/qr/:token/call', initiateCall);
router.post('/qr/:token/message', initiateMessage);
router.post('/qr/:token/push-notification', sendPushNotification);
router.post('/qr/:token/emergency', triggerEmergency);

export default router;
