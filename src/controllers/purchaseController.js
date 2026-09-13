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
import PhoneOTP from '../models/PhoneOTP.js';
import { sendSMS } from '../utils/smsService.js';
import { calculateNextStartNumber } from './adminController.js';
import { sendPurchaseConfirmationEmail } from '../utils/emailService.js';

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
      return res.status(400).json({ success: false, message: 'Valid mobile number or email is required.' });
    }

    const isPhone = /^\d+$/.test(target.replace(/\D/g, '')) && target.replace(/\D/g, '').length >= 10;
    const cleanPhone = isPhone ? target.replace(/\D/g, '').slice(-10) : null;
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    if (isPhone) {
      await PhoneOTP.deleteMany({ phone: cleanPhone });
      await PhoneOTP.create({
        phone: cleanPhone,
        otp,
        expiresAt,
        verified: false
      });
      await sendSMS(cleanPhone, otp);
    } else {
      await EmailOTP.deleteMany({ email: target.toLowerCase() });
      await EmailOTP.create({
        email: target.toLowerCase(),
        otp,
        expiresAt,
        verified: false
      });
      // Optionally, send email OTP here if you have an email OTP service
    }

    res.json({
      success: true,
      message: `OTP sent to ${target}.`
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

    const trimmedOtp = String(otp).trim();
    const isPhone = /^\d+$/.test(target.replace(/\D/g, '')) && target.replace(/\D/g, '').length >= 10;
    const cleanPhone = isPhone ? target.replace(/\D/g, '').slice(-10) : null;

    let record = null;
    
    if (isPhone) {
      record = await PhoneOTP.findOne({ phone: cleanPhone, otp: trimmedOtp });
    } else {
      record = await EmailOTP.findOne({ email: target.toLowerCase(), otp: trimmedOtp });
    }

    if (!record) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code.' });
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
      gender,
      activationPhone: reqActivationPhone,
      activationPhones: reqActivationPhones,
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
      razorpay_signature,
      paymentMethod // NEW
    } = req.body;

    if (!name || !phone || !address) {
      return res.status(400).json({ success: false, message: 'All contact and delivery details are required.' });
    }

    const cleanGender = (gender || 'MALE').trim();
    const quantity = Math.max(1, parseInt(reqQuantity, 10) || 1);
    const cleanEmail = (email || `${phone.trim()}@safedrive.local`).toLowerCase().trim();
    const cleanPhone = phone.trim();
    const cleanActivationPhone = (reqActivationPhone || cleanPhone).trim().replace(/\D/g, '').slice(-10);
    const cleanPincode = (pincode || '').trim();
    const cleanLandmark = (landmark || '').trim();

    let cleanActivationPhones = [];
    if (Array.isArray(reqActivationPhones) && reqActivationPhones.length > 0) {
      cleanActivationPhones = reqActivationPhones
        .map(p => (p || '').trim().replace(/\D/g, '').slice(-10))
        .filter(p => p.length === 10);
    }
    while (cleanActivationPhones.length < quantity) {
      cleanActivationPhones.push(cleanActivationPhone || cleanPhone);
    }

    // 1. Verify OTP was confirmed (via phone or email)
    const emailOtpRecord = await EmailOTP.findOne({
      $or: [{ email: cleanEmail }],
      verified: true
    });
    const phoneOtpRecord = await PhoneOTP.findOne({
      $or: [{ phone: cleanPhone }, { phone: cleanActivationPhone }],
      verified: true
    });
    
    if (!emailOtpRecord && !phoneOtpRecord) {
      return res.status(400).json({ success: false, message: 'OTP verification is required before placing an order.' });
    }

    // 2. Verify Razorpay Signature if in Live Mode and valid signature passed (Skip for COD)
    const isCOD = paymentMethod === 'COD';
    if (
      !isCOD &&
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
    let authUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'supersecretjwtkey_replace_in_prod');
        if (decoded && (decoded.id || decoded._id)) {
          authUserId = decoded.id || decoded._id;
        }
      } catch (e) {}
    }

    let user = null;
    if (authUserId) {
      user = await User.findById(authUserId);
    }

    const normalized10Phone = cleanPhone.replace(/\D/g, '').slice(-10);

    if (!user && normalized10Phone) {
      user = await User.findOne({
        $or: [
          { phone: normalized10Phone },
          { phone: `+91${normalized10Phone}` },
          { phone: `91${normalized10Phone}` },
          ...(cleanEmail ? [{ email: cleanEmail }] : [])
        ]
      });
    }

    if (!user) {
      const defaultPassword = await bcrypt.hash(`Safe@${normalized10Phone.slice(-4)}`, 10);
      try {
        user = await User.create({
          name: name.trim(),
          phone: normalized10Phone,
          email: cleanEmail || `${normalized10Phone}@safedrive.local`,
          gender: cleanGender,
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
      } catch (createErr) {
        // Fallback: If phone already exists, fetch the existing user record
        user = await User.findOne({
          $or: [
            { phone: normalized10Phone },
            { phone: `+91${normalized10Phone}` },
            { phone: `91${normalized10Phone}` }
          ]
        });
        if (!user) throw createErr;
      }
    }

    if (user) {
      if (name && name.trim()) user.name = name.trim();
      if (cleanEmail) user.email = cleanEmail;
      user.phone = normalized10Phone;
      if (cleanGender) user.gender = cleanGender;
      if (address && address.trim()) user.address = address.trim();
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
    let qrTypeDoc = null;
    if (product?.qrTypeId) {
      qrTypeDoc = await QRType.findById(product.qrTypeId);
    }
    if (!qrTypeDoc && product?.qrFor) {
      qrTypeDoc = await QRType.findOne({ name: { $regex: new RegExp(`^${product.qrFor.trim()}$`, 'i') }, isDeleted: { $ne: true } });
    }
    if (!qrTypeDoc && product?.name) {
      qrTypeDoc = await QRType.findOne({ name: { $regex: new RegExp(`^${product.name.trim()}$`, 'i') }, isDeleted: { $ne: true } });
    }

    const qrFor = qrTypeDoc?.name || product?.qrFor || product?.qrTypeName || 'Car';
    const isDigital = product ? (product.qrType === 'DIGITAL') : false;
    const productType = isDigital ? 'DIGITAL' : 'PHYSICAL';

    // Determine copies count
    const copiesPerSet = qrTypeDoc?.copiesPerSet || 2;

    const finalPaymentId = razorpay_payment_id || `pay_test_${Date.now()}`;
    const finalOrderId = razorpay_order_id || `order_${Date.now()}`;
    const unitPrice = product ? product.price : 299;
    let finalAmount = unitPrice * quantity;
    if (isCOD) {
      finalAmount += 59; // 50 delivery + 9 GST
    }
    const generatedOrderNumber = `ORD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    let allocatedQRs = [];

    // 5. DIGITAL vs PHYSICAL ALLOCATION
    if (isDigital) {
      // Case A: DIGITAL PRODUCT PURCHASE
      // Generate Digital QR batch for each quantity purchased. Status is GENERATED (Inactive until scanned & registered with OTP)
      const nextNum = await calculateNextStartNumber(quantity);
      const newBatchItems = [];

      const isNonVehicleItem = qrTypeDoc?.isVehicle === false ||
        ['luggage', 'bag', 'pet', 'key', 'keys', 'laptop', 'door', 'other', 'item'].some(nv => qrFor.toLowerCase().includes(nv));
      const itemIsVehicle = !isNonVehicleItem;

      for (let q = 0; q < quantity; q++) {
        const currentNum = nextNum + q;
        const numFormatted = String(currentNum).padStart(4, '0');
        const newProductId = `SD${numFormatted}`;
        const publicToken = crypto.randomBytes(16).toString('hex');
        newBatchItems.push({
          productId: newProductId,
          batchId: 'STORE-DIGITAL',
          copyCode: newProductId,
          publicToken,
          status: 'GENERATED', // Inactive by default; activates on scan & OTP verification
          userId: user._id,
          qrFor,
          qrType: 'DIGITAL',
          isVehicle: itemIsVehicle,
          category: itemIsVehicle ? 'VEHICLE' : 'NON_VEHICLE',
          securityCode: itemIsVehicle ? null : numFormatted,
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
      activationPhone: cleanActivationPhones[0] || cleanPhone,
      activationPhones: cleanActivationPhones,
      claimedCount: 0,
      claimedActivationPhones: [],
      customerName: user.name,
      customerEmail: cleanEmail,
      customerPhone: cleanPhone,
      customerGender: cleanGender,
      gender: cleanGender,
      deliveryAddress: user.address,
      city: user.city,
      state: user.state,
      pincode: cleanPincode,
      landmark: cleanLandmark,
      amount: finalAmount,
      unitPrice,
      quantity,
      paymentMethod: isCOD ? 'COD' : 'ONLINE',
      paymentStatus: isCOD ? 'PENDING' : 'PAID',
      deliveryStatus: isDigital ? 'DELIVERED' : 'PROCESSING',
      orderNumber: generatedOrderNumber,
      razorpayPaymentId: isCOD ? null : finalPaymentId,
      razorpayOrderId: isCOD ? null : finalOrderId,
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
        unitPrice,
        shippingFee: isCOD ? 59 : 0
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
      process.env.JWT_SECRET || 'supersecretjwtkey_replace_in_prod',
      { expiresIn: '30d' }
    );

    // Clear used OTP record
    await EmailOTP.deleteMany({ email: cleanPhone });

    // Send confirmation email asynchronously
    if (cleanEmail) {
      sendPurchaseConfirmationEmail(
        cleanEmail,
        user,
        {
          orderId: generatedOrderNumber,
          productName,
          amount: finalAmount,
          copiesPerSet: quantity,
          paymentMethod: isCOD ? 'COD' : 'ONLINE'
        },
        allocatedQRs.map(q => q.copyCode)
      ).catch(err => console.error('Failed to send purchase confirmation email:', err));
    }

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
      allocatedQRs: (allocatedQRs || []).filter(Boolean).map(q => ({
        _id: q._id,
        copyCode: q.copyCode,
        publicToken: q.publicToken,
        productId: q.productId,
        status: q?.status || 'GENERATED'
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
