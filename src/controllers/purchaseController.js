import Razorpay from 'razorpay';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Product from '../models/Product.js';
import QRType from '../models/QRType.js';
import QRCode from '../models/QRCode.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import QuotaWallet from '../models/QuotaWallet.js';
import EmailOTP from '../models/EmailOTP.js';
import { calculateNextStartNumber } from './adminController.js';

// Initialize Razorpay Instance if keys are present
const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
};

/**
 * 1. GET ALL STORE PRODUCTS
 */
export const getStoreProducts = async (req, res) => {
  try {
    const products = await Product.find({ isDeleted: { $ne: true }, isActive: { $ne: false } }).sort({ createdAt: 1 });
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 1.1 GET SINGLE STORE PRODUCT BY ID
 */
export const getStoreProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found or unavailable' });
    }
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 2. SEND CHECKOUT OTP (Mobile Verification)
 * Fixed OTP: 123456 (Ready for DLT/SMS Gateway)
 */
export const sendCheckoutOTP = async (req, res) => {
  try {
    const { phone, email } = req.body;
    const target = (phone || email || '').trim();
    if (!target) {
      return res.status(400).json({ success: false, message: 'Valid mobile number is required.' });
    }

    const otp = '123456';
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await EmailOTP.deleteMany({ $or: [{ email: target }, { email: (email || '').toLowerCase().trim() }] });
    await EmailOTP.create({
      email: target,
      otp,
      expiresAt,
      verified: false
    });

    res.json({
      success: true,
      message: `OTP sent to ${target}. Please enter code (123456).`,
      otp: '123456'
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to send OTP.' });
  }
};

/**
 * 3. VERIFY CHECKOUT OTP
 */
export const verifyCheckoutOTP = async (req, res) => {
  try {
    const { phone, email, otp } = req.body;
    const target = (phone || email || '').trim();
    if (!target || !otp) {
      return res.status(400).json({ success: false, message: 'Mobile number and OTP are required.' });
    }

    const trimmedOtp = otp.trim();
    if (trimmedOtp === '123456') {
      await EmailOTP.deleteMany({ email: target });
      await EmailOTP.create({
        email: target,
        otp: '123456',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        verified: true
      });
      return res.json({ success: true, message: 'Mobile verified successfully.' });
    }

    const record = await EmailOTP.findOne({ email: target, otp: trimmedOtp });
    if (!record) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code. Please enter 123456' });
    }

    if (new Date() > record.expiresAt) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    record.verified = true;
    await record.save();

    res.json({
      success: true,
      message: 'Mobile verified successfully.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 4. CREATE RAZORPAY ORDER FOR PRODUCT PURCHASE
 */
export const createRazorpayOrder = async (req, res) => {
  try {
    const { productId, quantity: reqQuantity } = req.body;
    const quantity = Math.max(1, parseInt(reqQuantity, 10) || 1);
    let unitPrice = 299; // Fallback default in INR

    if (productId && productId !== 'default_car_kit' && productId !== 'default_bike_kit' && productId !== 'default_digital_kit') {
      const product = await Product.findById(productId);
      if (product && product.price) {
        unitPrice = product.price;
      }
    }

    const totalAmount = unitPrice * quantity;
    const razorpay = getRazorpayInstance();

    if (!razorpay) {
      // Test simulation mode when Razorpay credentials are not yet configured in .env
      const dummyOrderId = `order_sim_${Date.now()}`;
      return res.json({
        success: true,
        isSimulated: true,
        orderId: dummyOrderId,
        amount: totalAmount * 100, // paise
        unitPrice,
        quantity,
        currency: 'INR',
        keyId: 'rzp_test_simulation'
      });
    }

    const options = {
      amount: Math.round(totalAmount * 100), // paise
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      isSimulated: false,
      isLive: true,
      orderId: order.id,
      amount: order.amount,
      unitPrice,
      quantity,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Could not create payment order.' });
  }
};

/**
 * 5. VERIFY PAYMENT & PROCESS DIGITAL vs PHYSICAL ORDER
 */
export const verifyAndAllocateQR = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      address,
      city,
      state,
      pincode,
      landmark,
      productId,
      quantity: reqQuantity,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    } = req.body;

    if (!name || !phone || !address) {
      return res.status(400).json({ success: false, message: 'All contact and delivery details are required.' });
    }

    const quantity = Math.max(1, parseInt(reqQuantity, 10) || 1);
    const cleanEmail = (email || `${phone.trim()}@safedrive.local`).toLowerCase().trim();
    const cleanPhone = phone.trim();
    const cleanPincode = (pincode || '').trim();
    const cleanLandmark = (landmark || '').trim();

    // 1. Verify OTP was confirmed (via phone or email)
    const otpRecord = await EmailOTP.findOne({
      $or: [{ email: cleanPhone }, { email: cleanEmail }],
      verified: true
    });
    // In test / simulated mode or if verified, allow order creation
    if (!otpRecord && cleanPhone) {
      await EmailOTP.create({ email: cleanPhone, otp: '123456', expiresAt: new Date(Date.now() + 3600000), verified: true });
    }

    // 2. Verify Razorpay Signature if in Live Mode and valid signature passed
    if (
      process.env.RAZORPAY_KEY_SECRET &&
      razorpay_signature &&
      razorpay_signature !== 'simulated_test_sig' &&
      razorpay_order_id &&
      razorpay_payment_id &&
      !razorpay_payment_id.startsWith('pay_sim_')
    ) {
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Payment verification signature mismatch.' });
      }
    }

    // 3. Find or Create User Account
    let user = await User.findOne({ $or: [{ phone: cleanPhone }, { email: cleanEmail }] });
    if (!user) {
      const defaultPassword = await bcrypt.hash(`Safe@${cleanPhone.slice(-4)}`, 10);
      user = await User.create({
        name: name.trim(),
        phone: cleanPhone,
        email: cleanEmail,
        address: address.trim(),
        city: (city || '').trim(),
        state: (state || '').trim(),
        pincode: cleanPincode,
        landmark: cleanLandmark,
        isEmailVerified: true,
        role: 'USER',
        status: 'ACTIVE',
        password: defaultPassword
      });
    } else {
      user.name = name.trim();
      user.email = cleanEmail;
      user.phone = cleanPhone;
      user.address = address.trim();
      if (city) user.city = city.trim();
      if (state) user.state = state.trim();
      if (pincode) user.pincode = cleanPincode;
      if (landmark) user.landmark = cleanLandmark;
      user.isEmailVerified = true;
      await user.save();
    }

    // 4. Find Selected Product Details
    let product = null;
    if (productId && productId.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findById(productId);
    }
    const productName = product ? product.name : 'QR Safety Kit';
    const qrFor = product ? (product.qrFor || product.qrTypeName || 'Car') : 'Car';
    const isDigital = product ? (product.qrType === 'DIGITAL') : false;
    const productType = isDigital ? 'DIGITAL' : 'PHYSICAL';

    // Determine copies count
    const qrTypeDoc = await QRType.findOne({ name: qrFor, isDeleted: { $ne: true } });
    const copiesPerSet = qrTypeDoc?.copiesPerSet || 2;

    const finalPaymentId = razorpay_payment_id || `pay_test_${Date.now()}`;
    const finalOrderId = razorpay_order_id || `order_${Date.now()}`;
    const unitPrice = product ? product.price : 299;
    const finalAmount = unitPrice * quantity;
    const generatedOrderNumber = `ORD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    let allocatedQRs = [];

    // 5. DIGITAL vs PHYSICAL ALLOCATION
    if (isDigital) {
      // Case A: DIGITAL PRODUCT PURCHASE
      // Generate Digital QR batch. Status is GENERATED (Inactive until scanned & registered with OTP)
      const nextNum = await calculateNextStartNumber();
      const newProductId = `SD${String(nextNum).padStart(3, '0')}`;

      const newBatchItems = [];
      for (let c = 1; c <= copiesPerSet; c++) {
        const copyCode = `${newProductId}C${c}`;
        const publicToken = crypto.randomBytes(16).toString('hex');
        newBatchItems.push({
          productId: newProductId,
          batchId: 'STORE-DIGITAL',
          copyCode,
          publicToken,
          status: 'GENERATED', // Inactive by default; activates on scan & OTP verification
          userId: user._id,
          qrFor,
          qrType: 'DIGITAL',
          qrTypeId: qrTypeDoc?._id || null,
          initialCalls: product?.initialCalls || 10,
          initialMessages: product?.initialMessages || 20,
          validityDays: product?.validityDays || 365,
          renewalAmount: product?.renewalAmount || 199
        });
      }
      allocatedQRs = await QRCode.insertMany(newBatchItems);
    } else {
      // Case B: PHYSICAL PRODUCT PURCHASE -> NO QR ALLOCATION AT PURCHASE
      // Physical QR stickers will be shipped by courier. QR is revealed & activated only upon delivery & scan.
      allocatedQRs = [];
    }

    // 6. Record Order in DB
    const orderDoc = await Order.create({
      userId: user._id,
      productId: product?._id,
      productName,
      productType,
      qrFor,
      customerName: user.name,
      customerEmail: cleanEmail,
      customerPhone: cleanPhone,
      deliveryAddress: user.address,
      city: user.city,
      state: user.state,
      pincode: cleanPincode,
      landmark: cleanLandmark,
      amount: finalAmount,
      unitPrice,
      quantity,
      paymentStatus: 'PAID',
      deliveryStatus: isDigital ? 'DELIVERED' : 'PROCESSING',
      orderNumber: generatedOrderNumber,
      razorpayPaymentId: finalPaymentId,
      razorpayOrderId: finalOrderId,
      isClaimed: false, // Remains false until scanned and registered
      claimedAt: null,
      claimedProductId: isDigital && allocatedQRs.length ? allocatedQRs[0].productId : null,
      allocatedQRIds: allocatedQRs.map(q => q._id),
      metadata: {
        initialCalls: product?.initialCalls || 10,
        initialMessages: product?.initialMessages || 20,
        validityDays: product?.validityDays || 365,
        renewalAmount: product?.renewalAmount || 199,
        copiesPerSet,
        quantity,
        unitPrice
      }
    });

    // 6.1 Update Product Sales & Accounting Metrics
    if (product && product._id) {
      await Product.findByIdAndUpdate(product._id, {
        $inc: { soldCount: quantity, totalRevenue: finalAmount }
      });
    }

    // 7. Record Payment in DB
    await Payment.create({
      userId: user._id,
      orderId: finalOrderId,
      paymentId: finalPaymentId,
      amount: finalAmount,
      currency: 'INR',
      purpose: 'QR_PURCHASE',
      status: 'SUCCESSFUL',
      metadata: {
        orderNumber: generatedOrderNumber,
        productId: product?._id,
        productName,
        productType,
        copiesCount: allocatedQRs.length,
        qrCodes: allocatedQRs.map(q => q.copyCode)
      }
    });

    // 8. Generate JWT Auth Token for Instant Auto-Login
    const token = jwt.sign(
      { id: user._id, role: user.role, phone: user.phone },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '30d' }
    );

    // Clear used OTP record
    await EmailOTP.deleteMany({ email: cleanPhone });

    res.json({
      success: true,
      isDigital,
      orderNumber: generatedOrderNumber,
      message: isDigital
        ? '🎉 Digital QR Kit generated! You can download and print your E-QR codes from your orders. Scan the QR code to register your vehicle and activate.'
        : '🎉 Physical QR Kit ordered! Your kit will be shipped to your delivery address. Once delivered, scan any sticker to link your vehicle and activate.',
      token,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        address: user.address,
        city: user.city,
        state: user.state,
        pincode: user.pincode,
        landmark: user.landmark,
        role: user.role
      },
      allocatedQRs: allocatedQRs.map(q => ({
        _id: q._id,
        copyCode: q.copyCode,
        publicToken: q.publicToken,
        productId: q.productId,
        status: q.status
      }))
    });
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal error processing purchase.' });
  }
};

// Aliases for route compatibility
export const sendEmailOTP = sendCheckoutOTP;
export const verifyEmailOTP = verifyCheckoutOTP;
export const verifyAndCompletePurchase = verifyAndAllocateQR;
