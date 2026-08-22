import express from 'express';
import {
  getStoreProducts,
  getStoreProductById,
  sendEmailOTP,
  verifyEmailOTP,
  createRazorpayOrder,
  verifyAndCompletePurchase
} from '../controllers/purchaseController.js';

const router = express.Router();

// Store Products & Purchasing Endpoints
router.get('/products', getStoreProducts);
router.get('/products/:id', getStoreProductById);
router.post('/send-otp', sendEmailOTP);
router.post('/verify-otp', verifyEmailOTP);
router.post('/create-order', createRazorpayOrder);
router.post('/complete', verifyAndCompletePurchase);

export default router;
