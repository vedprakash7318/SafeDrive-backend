import express from 'express';
import {
  login,
  register,
  createAdmin,
  sendLoginOTP,
  verifyLoginOTP,
  getMe,
  registerPartner
} from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/partner-register', registerPartner);
router.post('/create-admin', createAdmin);
router.post('/login', login);
router.post('/send-otp', sendLoginOTP);
router.post('/verify-otp', verifyLoginOTP);
router.post('/send-login-otp', sendLoginOTP);
router.post('/verify-login-otp', verifyLoginOTP);
router.get('/me', protect, getMe);

export default router;
