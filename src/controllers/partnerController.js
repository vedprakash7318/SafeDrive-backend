import PartnerProduct from '../models/PartnerProduct.js';
import PartnerOrder from '../models/PartnerOrder.js';
import SystemSetting from '../models/SystemSetting.js';
import { sendPartnerOrderEmail } from '../utils/emailService.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

function generateOrderNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'PB-'; // Partner Bulk
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const getPartnerSettings = async (req, res) => {
  try {
    const settings = await SystemSetting.findOne() || new SystemSetting();
    res.status(200).json({ success: true, data: { isCODEnabled: settings.isCODEnabled } });
  } catch (error) {
    console.error('Error fetching partner settings:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getActiveProducts = async (req, res) => {
  try {
    const products = await PartnerProduct.find({ isActive: true }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error('Error in getActiveProducts:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const placeOrder = async (req, res) => {
  try {
    const { 
      productId, 
      packageId, 
      deliveryAddress, 
      city, 
      state, 
      pincode, 
      landmark,
      paymentMethod,
      alternatePhone
    } = req.body;

    const partnerId = req.user._id;

    const product = await PartnerProduct.findById(productId);
    if (!product || !product.isActive) {
      return res.status(400).json({ success: false, message: 'Product not found or inactive' });
    }

    const selectedPackage = product.packages.id(packageId);
    if (!selectedPackage) {
      return res.status(400).json({ success: false, message: 'Invalid package selected' });
    }

    if (paymentMethod === 'COD') {
      const settings = await SystemSetting.findOne() || new SystemSetting();
      if (!settings.isCODEnabled) {
        return res.status(400).json({ success: false, message: 'COD is not enabled currently.' });
      }
    }

    const grandTotal = selectedPackage.totalPrice + selectedPackage.deliveryCharge;
    const orderNumber = generateOrderNumber();

    const newOrder = new PartnerOrder({
      partnerId,
      productId: product._id,
      productName: product.name,
      category: product.category,
      quantity: selectedPackage.quantity,
      totalAmount: selectedPackage.totalPrice,
      deliveryCharge: selectedPackage.deliveryCharge,
      grandTotal,
      partnerName: req.user.name || 'Partner',
      partnerPhone: req.user.phone,
      alternatePhone: alternatePhone || '',
      partnerEmail: req.user.email,
      deliveryAddress,
      city,
      state,
      pincode,
      landmark,
      paymentMethod,
      paymentStatus: paymentMethod === 'COD' ? 'PENDING' : 'PENDING',
      orderStatus: 'PENDING',
      orderNumber
    });

    if (paymentMethod === 'ONLINE') {
      const options = {
        amount: Math.round(grandTotal * 100), // amount in smallest currency unit
        currency: 'INR',
        receipt: orderNumber,
      };

      const razorpayOrder = await razorpay.orders.create(options);
      newOrder.razorpayOrderId = razorpayOrder.id;
      await newOrder.save();

      return res.status(201).json({ 
        success: true, 
        message: 'Order created, proceed to payment', 
        data: newOrder,
        requiresPayment: true,
        razorpayKey: process.env.RAZORPAY_KEY_ID,
        razorpayOrderId: razorpayOrder.id
      });
    }

    await newOrder.save();
    
    // Send email for COD order
    if (newOrder.partnerEmail) {
      sendPartnerOrderEmail(newOrder.partnerEmail, newOrder.partnerName, {
        orderNumber: newOrder.orderNumber,
        productName: newOrder.productName,
        quantity: newOrder.quantity,
        totalAmount: newOrder.grandTotal,
        paymentMethod: newOrder.paymentMethod
      }).catch(err => console.error('Failed to send partner order email:', err));
    }

    res.status(201).json({ success: true, message: 'Order placed successfully (COD)', data: newOrder });
  } catch (error) {
    console.error('Error in placeOrder:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

export const verifyPartnerPayment = async (req, res) => {
  try {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      const order = await PartnerOrder.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      order.paymentStatus = 'PAID';
      order.razorpayPaymentId = razorpay_payment_id;
      await order.save();

      // Send email for ONLINE order after successful payment
      if (order.partnerEmail) {
        sendPartnerOrderEmail(order.partnerEmail, order.partnerName, {
          orderNumber: order.orderNumber,
          productName: order.productName,
          quantity: order.quantity,
          totalAmount: order.grandTotal,
          paymentMethod: order.paymentMethod
        }).catch(err => console.error('Failed to send partner order email:', err));
      }

      return res.status(200).json({ success: true, message: 'Payment verified successfully', data: order });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Error in verifyPartnerPayment:', error);
    res.status(500).json({ success: false, message: 'Server error during verification' });
  }
};

export const getMyOrders = async (req, res) => {
  try {
    const orders = await PartnerOrder.find({ partnerId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    console.error("Error in getMyOrders:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

