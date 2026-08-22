import express from 'express';
import {
  login,
  register,
  sendLoginOTP,
  verifyLoginOTP,
  getMe
} from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/send-login-otp', sendLoginOTP);
router.post('/verify-login-otp', verifyLoginOTP);
router.get('/me', protect, getMe);

export default router;
