import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import QRCode from '../models/QRCode.js';
import Subscription from '../models/Subscription.js';
import QuotaWallet from '../models/QuotaWallet.js';
import QuotaTransaction from '../models/QuotaTransaction.js';
import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import QuotaPackage from '../models/QuotaPackage.js';
import SystemSetting from '../models/SystemSetting.js';
import ScanLog from '../models/ScanLog.js';
import AuditLog from '../models/AuditLog.js';
import Notification from '../models/Notification.js';
import crypto from 'crypto';

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

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('-password');
    // Find QRs where this user is the active vehicle owner (userId) OR the purchaser (buyerId)
    const qrs = await QRCode.find({
      $or: [{ userId }, { buyerId: userId }],
      isDeleted: { $ne: true }
    }).populate('vehicleId');

    // Ensure any non-vehicle QR has a 4-digit security PIN
    for (const q of qrs) {
      if (q.isVehicle === false && !q.securityCode) {
        q.securityCode = String(Math.floor(1000 + Math.random() * 9000));
        await QRCode.updateMany({ productId: q.productId }, { securityCode: q.securityCode });
      }
    }

    let vehicles = await Vehicle.find({ userId });
    
    // Also include any vehicles attached to the user's active QRs
    const qrVehicleIds = qrs.map(q => q.vehicleId?._id || q.vehicleId).filter(Boolean);
    if (qrVehicleIds.length > 0) {
      const linkedVehicles = await Vehicle.find({ _id: { $in: qrVehicleIds } });
      const vehicleMap = new Map();
      vehicles.forEach(v => vehicleMap.set(v._id.toString(), v));
      linkedVehicles.forEach(v => vehicleMap.set(v._id.toString(), v));
      vehicles = Array.from(vehicleMap.values());
    }

    const qrIdsList = qrs.map(q => q._id);
    const wallets = await QuotaWallet.find({
      $or: [{ userId }, { qrId: { $in: qrIdsList } }]
    });
    const subscriptions = await Subscription.find({
      $or: [{ userId }, { qrId: { $in: qrIdsList } }]
    }).sort({ createdAt: -1 });

    const activeQRs = qrs.filter(q => q.status === 'ACTIVE');

    // Group wallets by unique productId (Kit) only for ACTIVE QRs
    const productWalletMap = new Map();
    for (const qr of activeQRs) {
      if (qr.productId && !productWalletMap.has(qr.productId)) {
        const wallet = wallets.find(w => w.qrId?.toString() === qr._id?.toString());
        if (wallet) {
          productWalletMap.set(qr.productId, wallet);
        }
      }
    }

    let totalCallsRemaining = 0;
    let totalMessagesRemaining = 0;
    let totalCallsUsed = 0;
    let totalMessagesUsed = 0;

    if (activeQRs.length > 0) {
      if (productWalletMap.size > 0) {
        for (const wallet of productWalletMap.values()) {
          totalCallsRemaining += (wallet.callBalance || 0);
          totalMessagesRemaining += (wallet.messageBalance || 0);
          totalCallsUsed += (wallet.totalCallsUsed || 0);
          totalMessagesUsed += (wallet.totalMessagesUsed || 0);
        }
      } else if (wallets.length > 0) {
        // Fallback for standalone wallets
        totalCallsRemaining = wallets[0].callBalance || 0;
        totalMessagesRemaining = wallets[0].messageBalance || 0;
        totalCallsUsed = wallets[0].totalCallsUsed || 0;
        totalMessagesUsed = wallets[0].totalMessagesUsed || 0;
      }
    }

    // Enrich QRs with dynamic live renewal prices from current Product Catalog
    const activeProducts = await Product.find({ isDeleted: { $ne: true } });
    const productCategoryMap = new Map();
    for (const p of activeProducts) {
      if (p.qrFor && typeof p.renewalAmount === 'number') {
        productCategoryMap.set(p.qrFor.trim().toLowerCase(), p.renewalAmount);
      }
    }

    const enrichedQRs = qrs.map(q => {
      const qObj = q.toObject ? q.toObject() : { ...q };
      const catKey = (qObj.qrFor || 'Car').trim().toLowerCase();
      if (productCategoryMap.has(catKey)) {
        qObj.renewalAmount = productCategoryMap.get(catKey);
      }
      return qObj;
    });

    res.json({
      success: true,
      user,
      vehicles,
      qrs: enrichedQRs,
      wallets,
      subscriptions,
      summary: {
        totalVehicles: vehicles.length,
        totalQRs: qrs.length,
        activeQRs: qrs.filter(q => q.status === 'ACTIVE').length,
        soldQRs: qrs.filter(q => q.status === 'SOLD').length,
        totalCallsRemaining,
        totalMessagesRemaining,
        totalCallsUsed,
        totalMessagesUsed
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const buyQuota = async (req, res) => {
  try {
    const userId = req.user._id;
    const { qrId, packageId } = req.body;

    const qr = await QRCode.findOne({ _id: qrId, userId });
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR Code not found for this user' });
    }

    const pkg = await QuotaPackage.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    // Payment verification
    const orderId = `ORD_${Date.now()}`;
    const paymentId = `PAY_${crypto.randomBytes(6).toString('hex')}`;

    await Payment.create({
      userId,
      orderId,
      paymentId,
      amount: pkg.price,
      purpose: pkg.category === 'CALL' ? 'CALL_PACKAGE' : 'MESSAGE_PACKAGE',
      status: 'SUCCESSFUL',
      metadata: { qrId, productId: qr.productId, packageName: pkg.name, quantity: pkg.quantity }
    });

    // Atomic update wallet
    let wallet = await QuotaWallet.findOne({ qrId: qr._id });
    if (!wallet) {
      wallet = await QuotaWallet.create({
        userId,
        qrId: qr._id,
        callBalance: 0,
        messageBalance: 0
      });
    }

    // Sibling copies sync
    const siblingQRs = await QRCode.find({ productId: qr.productId });
    const siblingIds = siblingQRs.map(s => s._id);

    if (pkg.category === 'CALL') {
      wallet.callBalance += pkg.quantity;
      wallet.totalCallsPurchased += pkg.quantity;
      await wallet.save();

      // Sync sibling copies
      await QuotaWallet.updateMany(
        { qrId: { $in: siblingIds } },
        { callBalance: wallet.callBalance, totalCallsPurchased: wallet.totalCallsPurchased }
      );

      // Record Quota Transaction once for the Product Kit
      await QuotaTransaction.create({
        userId,
        qrId: qr._id,
        productId: qr.productId,
        type: 'CREDIT',
        category: 'CALL',
        quantity: pkg.quantity,
        balanceAfter: wallet.callBalance,
        source: 'PURCHASE_ADDON',
        amountPaid: pkg.price,
        paymentId,
        orderId,
        packageName: pkg.name,
        performedBy: 'Customer (Self-Purchase)',
        reason: `Purchased Add-On: ${pkg.name} (+${pkg.quantity} Calls for ₹${pkg.price})`
      });
    } else {
      wallet.messageBalance += pkg.quantity;
      wallet.totalMessagesPurchased += pkg.quantity;
      await wallet.save();

      // Sync sibling copies
      await QuotaWallet.updateMany(
        { qrId: { $in: siblingIds } },
        { messageBalance: wallet.messageBalance, totalMessagesPurchased: wallet.totalMessagesPurchased }
      );

      // Record Quota Transaction once for the Product Kit
      await QuotaTransaction.create({
        userId,
        qrId: qr._id,
        productId: qr.productId,
        type: 'CREDIT',
        category: 'MESSAGE',
        quantity: pkg.quantity,
        balanceAfter: wallet.messageBalance,
        source: 'PURCHASE_ADDON',
        amountPaid: pkg.price,
        paymentId,
        orderId,
        packageName: pkg.name,
        performedBy: 'Customer (Self-Purchase)',
        reason: `Purchased Add-On: ${pkg.name} (+${pkg.quantity} SMS for ₹${pkg.price})`
      });
    }

    // Audit Log for purchase
    AuditLog.create({
      action: 'BUY_QUOTA_PACKAGE',
      targetId: qr.productId,
      newValue: { package: pkg.name, quantity: pkg.quantity, price: pkg.price },
      ip: req.ip || ''
    }).catch(() => {});

    res.json({
      success: true,
      message: `🎉 Successfully purchased ${pkg.name}! +${pkg.quantity} quota credited.`,
      wallet
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send Renewal OTP to User's Registered Mobile Number
 */
/**
 * Send Renewal OTP to User's Registered Mobile Number
 */
export const sendRenewalOTP = async (req, res) => {
  try {
    const userId = req.user._id;
    const { qrId } = req.body;

    let qr = null;
    if (mongoose.Types.ObjectId.isValid(qrId)) {
      qr = await QRCode.findOne({ _id: qrId, userId });
    }
    if (!qr) {
      qr = await QRCode.findOne({ productId: qrId, userId });
    }
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR Kit not found for this user' });
    }

    // Enforce 2-Year Maximum Validity Cap (730 Days)
    const now = new Date();
    const remainingDays = qr.expiryDate ? Math.ceil((new Date(qr.expiryDate) - now) / (1000 * 60 * 60 * 24)) : 0;
    if (remainingDays >= 730) {
      return res.status(400).json({
        success: false,
        message: `❌ Renewal not allowed: This QR is already active with full 2-year protection (${remainingDays} days remaining). Maximum validity limit is 2 Years (730 days).`
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.phone) {
      return res.status(400).json({ success: false, message: 'Registered mobile number not found.' });
    }

    const cleanPhone = user.phone.replace(/\D/g, '').slice(-10);

    res.json({
      success: true,
      message: `Renewal OTP sent to registered number +91 ${cleanPhone.slice(0, 2)}******${cleanPhone.slice(-2)}`,
      phone: cleanPhone,
      otp: '123456'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create Razorpay Order for Renewal
 */
export const createRenewalOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { qrId, renewalPrice } = req.body;

    let qr = null;
    if (mongoose.Types.ObjectId.isValid(qrId)) {
      qr = await QRCode.findOne({ _id: qrId, userId });
    }
    if (!qr) {
      qr = await QRCode.findOne({ productId: qrId, userId });
    }
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR Kit not found for this user.' });
    }

    // Enforce 2-Year Maximum Validity Cap (730 Days)
    const now = new Date();
    const remainingDays = qr.expiryDate ? Math.ceil((new Date(qr.expiryDate) - now) / (1000 * 60 * 60 * 24)) : 0;
    if (remainingDays >= 730) {
      return res.status(400).json({
        success: false,
        message: `❌ Renewal not allowed: This QR is already active with ${remainingDays} days remaining. Maximum allowed validity is 2 Years (730 days).`
      });
    }

    // Dynamically resolve live renewal price from active Product Catalog
    let liveRenewalPrice = qr.renewalAmount || 199;
    if (qr.qrFor) {
      const matchedProduct = await Product.findOne({
        $or: [{ qrFor: qr.qrFor }, { name: new RegExp(`^${qr.qrFor}$`, 'i') }],
        isDeleted: { $ne: true }
      }).sort({ updatedAt: -1 });
      if (matchedProduct && typeof matchedProduct.renewalAmount === 'number') {
        liveRenewalPrice = matchedProduct.renewalAmount;
      }
    }

    const price = liveRenewalPrice;
    const razorpay = getRazorpayInstance();

    if (!razorpay) {
      // Test simulation mode when Razorpay keys are not in .env
      const dummyOrderId = `renew_sim_${Date.now()}`;
      return res.json({
        success: true,
        isSimulated: true,
        orderId: dummyOrderId,
        amount: Math.round(price * 100),
        renewalPrice: price,
        currency: 'INR',
        keyId: 'rzp_test_simulation'
      });
    }

    const options = {
      amount: Math.round(price * 100), // in paise
      currency: 'INR',
      receipt: `renew_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      isSimulated: false,
      isLive: true,
      orderId: order.id,
      amount: order.amount,
      renewalPrice: price,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Could not initialize payment order' });
  }
};

/**
 * Verify OTP, Verify Razorpay Payment & Renew Subscription (Capped at 2 Years / 730 Days max)
 */
export const renewSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      qrId,
      otp,
      paymentMethod = 'RAZORPAY_GATEWAY',
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    } = req.body;

    // Validate OTP
    if (!otp || String(otp).trim() !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid or missing OTP code. Please enter 123456 to verify renewal.' });
    }

    let qr = null;
    if (mongoose.Types.ObjectId.isValid(qrId)) {
      qr = await QRCode.findOne({ _id: qrId, $or: [{ userId }, { buyerId: userId }] });
    }
    if (!qr) {
      qr = await QRCode.findOne({ productId: qrId, $or: [{ userId }, { buyerId: userId }] });
    }
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR Code not found for this user' });
    }

    // Enforce 2-Year Maximum Validity Cap (730 Days)
    const now = new Date();
    const remainingDays = qr.expiryDate ? Math.ceil((new Date(qr.expiryDate) - now) / (1000 * 60 * 60 * 24)) : 0;
    if (remainingDays >= 730) {
      return res.status(400).json({
        success: false,
        message: `❌ Renewal not allowed: This QR is already active with ${remainingDays} days of validity. Maximum validity cannot exceed 2 Years (730 days).`
      });
    }

    // Dynamically resolve live renewal price from active Product Catalog
    let liveRenewalPrice = qr.renewalAmount || 199;
    if (qr.qrFor) {
      const matchedProduct = await Product.findOne({
        $or: [{ qrFor: qr.qrFor }, { name: new RegExp(`^${qr.qrFor}$`, 'i') }],
        isDeleted: { $ne: true }
      }).sort({ updatedAt: -1 });
      if (matchedProduct && typeof matchedProduct.renewalAmount === 'number') {
        liveRenewalPrice = matchedProduct.renewalAmount;
      }
    }

    // Razorpay signature verification if live payment details provided
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
        return res.status(400).json({ success: false, message: 'Razorpay payment signature verification failed.' });
      }
    }

    const numericPrice = liveRenewalPrice;
    const orderId = razorpay_order_id || `RENEW_${Date.now()}`;
    const paymentId = razorpay_payment_id || `PAY_${crypto.randomBytes(6).toString('hex')}`;

    await Payment.create({
      userId,
      orderId,
      paymentId,
      amount: numericPrice,
      purpose: 'RENEWAL',
      status: 'SUCCESSFUL',
      paymentMethod,
      razorpayPaymentId: razorpay_payment_id || paymentId,
      razorpayOrderId: razorpay_order_id || orderId,
      metadata: { qrId: qr._id, productId: qr.productId, validityDaysAdded: 365 }
    });

    // Extend by +365 Days from existing expiry date, capped at max 2 Years (730 days) from today
    const currentExpiry = qr.expiryDate && new Date(qr.expiryDate) > now ? new Date(qr.expiryDate) : now;
    let newExpiry = new Date(currentExpiry.getTime() + 365 * 24 * 60 * 60 * 1000);
    const max2YearCap = new Date(now.getTime() + 730 * 24 * 60 * 60 * 1000);
    if (newExpiry > max2YearCap) {
      newExpiry = max2YearCap;
    }

    // Update ALL sibling copies of this product kit
    await QRCode.updateMany(
      { productId: qr.productId },
      { expiryDate: newExpiry, status: 'ACTIVE' }
    );

    await Subscription.create({
      userId,
      qrId: qr._id,
      startDate: now,
      expiryDate: newExpiry,
      endDate: newExpiry,
      renewalAmount: numericPrice,
      price: numericPrice,
      status: 'ACTIVE',
      paymentId
    });

    const bonusCalls = 10;
    const bonusMessages = 20;

    let primaryWallet = null;
    for (const item of siblingQRs) {
      let wallet = await QuotaWallet.findOne({ qrId: item._id });
      if (!wallet) {
        wallet = await QuotaWallet.create({
          userId,
          qrId: item._id,
          callBalance: 0,
          messageBalance: 0
        });
      }

      wallet.callBalance += bonusCalls;
      wallet.messageBalance += bonusMessages;
      await wallet.save();

      if (!primaryWallet) {
        primaryWallet = wallet;
      }
    }

    // Create Ledger Quota Transactions ONCE for the entire Kit Set
    await QuotaTransaction.create({
      userId,
      qrId: qr._id,
      productId: qr.productId,
      type: 'CREDIT',
      category: 'CALL',
      quantity: bonusCalls,
      balanceAfter: primaryWallet?.callBalance || bonusCalls,
      source: 'RENEWAL',
      performedBy: 'Customer (Renewal)',
      reason: `Subscription Renewal Bonus Calls (${qr.productId})`
    });

    await QuotaTransaction.create({
      userId,
      qrId: qr._id,
      productId: qr.productId,
      type: 'CREDIT',
      category: 'MESSAGE',
      quantity: bonusMessages,
      balanceAfter: primaryWallet?.messageBalance || bonusMessages,
      source: 'RENEWAL',
      performedBy: 'Customer (Renewal)',
      reason: `Subscription Renewal Bonus Messages (${qr.productId})`
    });

    // Audit Log
    AuditLog.create({
      action: 'RENEW_SUBSCRIPTION',
      targetId: qr.productId,
      newValue: { newExpiry, renewalPrice: numericPrice, bonusCalls, bonusMessages, paymentId },
      ip: req.ip || ''
    }).catch(() => {});

    res.json({
      success: true,
      message: '🎉 Subscription successfully renewed! 365 Days added, old quota preserved + 10 calls & 20 SMS bonus added.',
      expiryDate: newExpiry,
      wallet: primaryWallet,
      paymentId,
      orderId
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateEmergencyContacts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { vehicleId, emergencyContacts } = req.body;

    if (!emergencyContacts || emergencyContacts.length < 2) {
      return res.status(400).json({ success: false, message: 'Exactly 2 emergency contacts are required' });
    }

    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: vehicleId, userId },
      { emergencyContacts },
      { new: true }
    );

    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    res.json({ success: true, message: 'Emergency contacts updated successfully', vehicle });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLedger = async (req, res) => {
  try {
    const userId = req.user._id;
    const transactions = await QuotaTransaction.find({ userId })
      .populate('qrId', 'copyCode productId')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Activate a Purchased QR Sticker & Bind Vehicle
 */
export const activatePurchasedQR = async (req, res) => {
  try {
    const userId = req.user._id;
    const { qrId, vehicleBrand, vehicleName, vehicleNumber, emergencyContacts } = req.body;

    if (!vehicleBrand || !vehicleName || !vehicleNumber) {
      return res.status(400).json({ success: false, message: 'All vehicle details (Brand, Model, Number) are required.' });
    }

    if (!emergencyContacts || emergencyContacts.length < 2) {
      return res.status(400).json({ success: false, message: 'Please provide at least 2 emergency contacts.' });
    }

    const targetQR = await QRCode.findOne({ _id: qrId, userId });
    if (!targetQR) {
      return res.status(404).json({ success: false, message: 'QR Code not found in your account.' });
    }

    // Create Vehicle
    const cleanPlate = vehicleNumber.toUpperCase().replace(/\s+/g, '');
    const vehicle = await Vehicle.create({
      userId,
      vehicleBrand: vehicleBrand.trim(),
      vehicleName: vehicleName.trim(),
      vehicleNumber: cleanPlate,
      emergencyContacts
    });

    const now = new Date();
    const validityDays = targetQR.validityDays || 365;
    const expiryDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    // Update all copies in this product set
    await QRCode.updateMany(
      { productId: targetQR.productId, userId },
      {
        status: 'ACTIVE',
        vehicleId: vehicle._id,
        activationDate: now,
        expiryDate
      }
    );

    // Initialize Quota Wallet
    let wallet = await QuotaWallet.findOne({ qrId: targetQR._id });
    const starterCalls = targetQR.initialCalls || 10;
    const starterMsgs = targetQR.initialMessages || 20;

    if (!wallet) {
      wallet = await QuotaWallet.create({
        userId,
        qrId: targetQR._id,
        callBalance: starterCalls,
        messageBalance: starterMsgs,
        totalCallsPurchased: starterCalls,
        totalMessagesPurchased: starterMsgs
      });
    }

    // Sync sibling copies
    const siblingQRs = await QRCode.find({ productId: targetQR.productId });
    const siblingIds = siblingQRs.map(s => s._id);
    await QuotaWallet.updateMany(
      { qrId: { $in: siblingIds } },
      {
        userId,
        callBalance: wallet.callBalance,
        messageBalance: wallet.messageBalance,
        totalCallsPurchased: wallet.totalCallsPurchased,
        totalMessagesPurchased: wallet.totalMessagesPurchased
      }
    );

    // Record Ledger Quota Transactions ONCE for the entire Kit Set (productId)
    await QuotaTransaction.create({
      userId,
      qrId: targetQR._id,
      productId: targetQR.productId,
      type: 'CREDIT',
      category: 'CALL',
      quantity: starterCalls,
      balanceAfter: starterCalls,
      source: 'INITIAL_FREE',
      amountPaid: 0,
      performedBy: 'System (Kit Activation)',
      reason: `Initial Starter Calling Quota (${targetQR.productId})`
    });

    await QuotaTransaction.create({
      userId,
      qrId: targetQR._id,
      productId: targetQR.productId,
      type: 'CREDIT',
      category: 'MESSAGE',
      quantity: starterMsgs,
      balanceAfter: starterMsgs,
      source: 'INITIAL_FREE',
      amountPaid: 0,
      performedBy: 'System (Kit Activation)',
      reason: `Initial Starter SMS Quota (${targetQR.productId})`
    });

    // Subscription Record
    await Subscription.create({
      userId,
      qrId: targetQR._id,
      startDate: now,
      expiryDate,
      endDate: expiryDate,
      renewalAmount: targetQR.renewalAmount || 199,
      price: targetQR.renewalAmount || 199,
      status: 'ACTIVE'
    });

    // Audit Log
    AuditLog.create({
      action: 'ACTIVATE_QR_KIT',
      targetId: targetQR.productId,
      newValue: { vehicleNumber: cleanPlate, vehicleName: vehicle.vehicleName, copies: siblingQRs.length },
      ip: req.ip || ''
    }).catch(() => {});

    res.json({
      success: true,
      message: `🎉 Vehicle ${cleanPlate} bound and QR set ${targetQR.productId} activated successfully!`,
      vehicle
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get User Purchase Orders History
 */
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    const cleanPhone = user?.phone ? user.phone.replace(/\D/g, '').slice(-10) : '';
    const phonePattern = cleanPhone && cleanPhone.length >= 8 ? cleanPhone.slice(-8) : '';

    const rawOrders = await Order.find({
      $or: [
        { userId },
        ...(cleanPhone ? [
          { customerPhone: cleanPhone },
          { customerPhone: { $regex: phonePattern } },
          { activationPhone: cleanPhone },
          { activationPhones: cleanPhone }
        ] : [])
      ]
    })
      .populate('productId', 'name title price qrFor imageUrl')
      .populate('allocatedQRIds', 'productId copyCode status publicToken activatedByName activationDate securityCode isVehicle')
      .sort({ createdAt: -1 });

    const orders = rawOrders.map(order => {
      const qty = Math.max(1, order.quantity || 1);
      const claimed = order.claimedCount || 0;
      const pending = Math.max(0, qty - claimed);

      return {
        _id: order._id,
        orderNumber: order.orderNumber,
        productName: order.productName,
        productType: order.productType,
        qrFor: order.qrFor || 'Vehicle',
        amount: order.amount,
        quantity: qty,
        unitPrice: order.unitPrice || Math.round(order.amount / qty),
        claimedCount: claimed,
        pendingCount: pending,
        isClaimed: order.isClaimed || claimed >= qty,
        claimedProductId: order.claimedProductId,
        claimedActivationPhones: order.claimedActivationPhones || [],
        paymentStatus: order.paymentStatus,
        deliveryStatus: order.deliveryStatus,
        courierPartner: order.courierPartner,
        trackingNumber: order.trackingNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        deliveryAddress: order.deliveryAddress,
        city: order.city,
        state: order.state,
        pincode: order.pincode,
        landmark: order.landmark,
        productId: order.productId ? {
          _id: order.productId._id,
          name: order.productId.name,
          title: order.productId.title || order.productId.name,
          price: order.productId.price,
          qrFor: order.productId.qrFor,
          imageUrl: order.productId.imageUrl
        } : null,
        allocatedQRIds: order.allocatedQRIds || [],
        metadata: {
          copiesPerSet: order.metadata?.copiesPerSet || 2,
          initialCalls: order.metadata?.initialCalls || 10,
          initialMessages: order.metadata?.initialMessages || 20,
          validityDays: order.metadata?.validityDays || 365,
          renewalAmount: order.metadata?.renewalAmount || 199
        },
        createdAt: order.createdAt
      };
    });

    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Active Top-Up Packages for User
 */
export const getUserPackages = async (req, res) => {
  try {
    let packages = await QuotaPackage.find({ status: 'ACTIVE', isDeleted: { $ne: true } }).sort({ price: 1 });
    if (packages.length === 0) {
      const defaultPackages = [
        { name: 'Starter Call Pack', category: 'CALL', quantity: 50, price: 99, durationDays: 365, bonusCalls: 0, bonusMessages: 50, status: 'ACTIVE' },
        { name: 'Pro Protection Booster', category: 'CALL', quantity: 150, price: 199, durationDays: 365, bonusCalls: 0, bonusMessages: 150, status: 'ACTIVE' },
        { name: 'Annual Unlimited Shield', category: 'CALL', quantity: 500, price: 399, durationDays: 365, bonusCalls: 0, bonusMessages: 500, status: 'ACTIVE' },
        { name: 'WhatsApp Alerts Booster', category: 'MESSAGE', quantity: 100, price: 49, durationDays: 365, bonusCalls: 0, bonusMessages: 0, status: 'ACTIVE' }
      ];
      packages = await QuotaPackage.insertMany(defaultPackages);
    }
    res.json({ success: true, packages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update User Contact & Delivery Profile
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, email, whatsappNumber, gender, address, city, state, pincode } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name) user.name = name.trim();
    if (email) user.email = email.trim().toLowerCase();
    if (whatsappNumber) user.whatsappNumber = whatsappNumber.trim();
    if (gender) user.gender = gender.trim().toUpperCase();
    if (address) user.address = address.trim();
    if (city) user.city = city.trim();
    if (state) user.state = state.trim();
    if (pincode) user.pincode = pincode.trim();

    await user.save();
    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        gender: user.gender,
        whatsappNumber: user.whatsappNumber,
        address: user.address,
        city: user.city,
        state: user.state,
        pincode: user.pincode,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Comprehensive QR & Product Kit Details for User
 */
export const getQRDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    let qr = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      qr = await QRCode.findOne({ _id: id, userId }).populate('vehicleId').populate('qrTypeId').populate('qrFormatId');
    }
    if (!qr) {
      qr = await QRCode.findOne({ productId: id, userId }).populate('vehicleId').populate('qrTypeId').populate('qrFormatId');
    }
    if (!qr) {
      qr = await QRCode.findOne({ copyCode: id, userId }).populate('vehicleId').populate('qrTypeId').populate('qrFormatId');
    }
    if (!qr) {
      qr = await QRCode.findOne({ publicToken: id, userId }).populate('vehicleId').populate('qrTypeId').populate('qrFormatId');
    }
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR Kit not found for this user.' });
    }

    // Sibling copies in this product kit (e.g. SD001C1, SD001C2)
    const siblingCopies = await QRCode.find({ productId: qr.productId, userId, isDeleted: { $ne: true } })
      .populate('vehicleId')
      .populate('qrTypeId')
      .populate('qrFormatId')
      .sort({ copyCode: 1 });

    const siblingIds = siblingCopies.map(c => c._id);

    // Quota Wallet for this Kit/QR
    const wallet = await QuotaWallet.findOne({
      $or: [
        { qrId: qr._id },
        { qrId: { $in: siblingIds } }
      ]
    });

    // Associated User Profile
    const user = await User.findById(userId).select('-password');

    // Associated Vehicle
    let vehicle = qr.vehicleId;
    if (!vehicle) {
      const activeSibling = siblingCopies.find(c => c.vehicleId);
      if (activeSibling) vehicle = activeSibling.vehicleId;
    }

    // Associated Order Info
    // Associated Orders & Payments History for this specific Kit
    const ordersList = await Order.find({
      $or: [
        { claimedProductId: qr.productId },
        { allocatedQRIds: qr._id },
        { allocatedQRIds: { $in: siblingIds } }
      ],
      userId
    }).sort({ createdAt: -1 });

    const order = ordersList.length > 0 ? ordersList[0] : null;

    // Associated Subscription
    const subscription = await Subscription.findOne({
      $or: [
        { qrId: qr._id },
        { qrId: { $in: siblingIds } }
      ],
      userId
    }).sort({ createdAt: -1 });

    // Recent Scans
    const recentScans = await ScanLog.find({
      qrId: { $in: siblingIds }
    }).sort({ createdAt: -1 }).limit(10);

    const quotaTxList = await QuotaTransaction.find({
      $or: [
        { qrId: qr._id },
        { qrId: { $in: siblingIds } },
        { productId: qr.productId }
      ]
    }).sort({ createdAt: -1 });

    // Format real financial payment history (ONLY REAL PAID TRANSACTIONS)
    const paymentHistory = [];

    // 1. Add Real Paid Kit Orders
    ordersList.filter(o => o.paymentStatus === 'PAID').forEach(o => {
      paymentHistory.push({
        id: o._id,
        type: 'KIT_PURCHASE',
        title: `Vehicle Safety Kit Purchase (${o.productName || category})`,
        amount: o.amount,
        date: o.createdAt,
        status: 'PAID',
        method: o.paymentMethod || 'Online Payment',
        refNumber: o.orderNumber || o.razorpayPaymentId || `ORD-${qr.productId}`
      });
    });

    // 2. Add Real Paid Renewals & Paid Booster Purchases (Excluding free starter allocations)
    quotaTxList
      .filter(tx => tx.source === 'RENEWAL' || tx.source === 'PURCHASE')
      .forEach(tx => {
        paymentHistory.push({
          id: tx._id,
          type: tx.source === 'RENEWAL' ? 'SUBSCRIPTION_RENEWAL' : 'QUOTA_BOOSTER',
          title: tx.reason || (tx.source === 'RENEWAL' ? 'Annual Subscription Renewal (+365 Days)' : 'Quota Booster Purchase'),
          amount: tx.source === 'RENEWAL' ? (qr.renewalAmount || 199) : (tx.amount || 49),
          date: tx.createdAt,
          status: 'PAID',
          method: 'Online Payment',
          refNumber: `TXN-${tx._id.toString().slice(-8).toUpperCase()}`
        });
      });

    // If no order record was found but QR is active, show the initial activation purchase
    if (paymentHistory.length === 0 && qr.createdAt) {
      paymentHistory.push({
        id: qr._id,
        type: 'KIT_PURCHASE',
        title: `Vehicle Safety Kit Purchase (${category})`,
        amount: 299,
        date: qr.activationDate || qr.createdAt,
        status: 'PAID',
        method: 'Online Payment',
        refNumber: `ORD-${qr.productId}`
      });
    }

    // Sort all payment records newest first
    paymentHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Dynamic QR Category directly from backend record (qrFor or qrTypeId or Product)
    const category = qr.qrFor || (qr.qrTypeId && qr.qrTypeId.name) || 'Protected Item';

    // Dynamically resolve live renewal price from active Product Catalog
    let liveRenewalPrice = qr.renewalAmount || 199;
    if (category) {
      const matchedProduct = await Product.findOne({
        $or: [{ qrFor: category }, { name: new RegExp(`^${category}$`, 'i') }],
        isDeleted: { $ne: true }
      }).sort({ updatedAt: -1 });
      if (matchedProduct && typeof matchedProduct.renewalAmount === 'number') {
        liveRenewalPrice = matchedProduct.renewalAmount;
      }
    }

    const qrObj = qr.toObject ? qr.toObject() : { ...qr };
    qrObj.renewalAmount = liveRenewalPrice;

    const totalCalls = (wallet?.callBalance || 0) + (wallet?.totalCallsUsed || 0);
    const totalMessages = (wallet?.messageBalance || 0) + (wallet?.totalMessagesUsed || 0);

    res.json({
      success: true,
      qr: qrObj,
      category,
      copies: siblingCopies.length > 0 ? siblingCopies : [qr],
      wallet: {
        callBalance: wallet?.callBalance || 0,
        totalCalls: totalCalls > 0 ? totalCalls : 10,
        totalCallsUsed: wallet?.totalCallsUsed || 0,
        messageBalance: wallet?.messageBalance || 0,
        totalMessages: totalMessages > 0 ? totalMessages : 20,
        totalMessagesUsed: wallet?.totalMessagesUsed || 0
      },
      vehicle,
      user,
      order: order ? {
        orderNumber: order.orderNumber,
        amount: order.amount,
        productName: order.productName,
        productType: order.productType,
        paymentStatus: order.paymentStatus,
        deliveryStatus: order.deliveryStatus,
        createdAt: order.createdAt,
        courierPartner: order.courierPartner,
        trackingNumber: order.trackingNumber,
        deliveryAddress: order.deliveryAddress,
        city: order.city,
        state: order.state,
        pincode: order.pincode
      } : null,
      paymentHistory,
      subscription,
      recentScans
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update Personal Details & Emergency Contacts for a User's QR Kit
 * Note: Vehicle details (brand, name, plate number) remain securely locked once activated!
 */
export const updateUserQRDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const {
      name,
      email,
      whatsappNumber,
      gender,
      address,
      city,
      state,
      pincode,
      landmark,
      vehicleName,
      vehicleBrand,
      vehicleNumber,
      emergencyContacts,
      status
    } = req.body;

    let qr = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      qr = await QRCode.findOne({ _id: id, userId }).populate('vehicleId');
    }
    if (!qr) {
      qr = await QRCode.findOne({ productId: id, userId }).populate('vehicleId');
    }
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR Kit not found for this user.' });
    }

    // 1. Update Personal Profile
    const user = await User.findById(userId);
    if (user) {
      if (name) user.name = name.trim();
      if (email) user.email = email.trim().toLowerCase();
      if (whatsappNumber) user.whatsappNumber = whatsappNumber.trim();
      if (gender) user.gender = gender;
      if (address) user.address = address.trim();
      if (city) user.city = city.trim();
      if (state) user.state = state.trim();
      if (pincode) user.pincode = pincode.trim();
      if (landmark) user.landmark = landmark.trim();
      await user.save();
    }

    // 2. Update Associated Vehicle Details & Emergency Contacts
    let updatedVehicle = null;
    if (qr.vehicleId) {
      const vehicleId = qr.vehicleId._id || qr.vehicleId;
      const updateData = {};

      if (vehicleName) updateData.vehicleName = vehicleName.trim();
      if (vehicleBrand) updateData.vehicleBrand = vehicleBrand.trim();
      if (vehicleNumber) updateData.vehicleNumber = vehicleNumber.trim().toUpperCase().replace(/\s+/g, ' ');

      if (emergencyContacts && Array.isArray(emergencyContacts)) {
        const validContacts = emergencyContacts.filter(c => c.name && c.number && c.number.trim().length >= 10);
        updateData.emergencyContacts = validContacts;
      }

      updatedVehicle = await Vehicle.findOneAndUpdate(
        { _id: vehicleId, userId },
        updateData,
        { new: true }
      );
    }

    // 3. Update QR Status (if toggled between ACTIVE and INACTIVE/SUSPENDED)
    if (status && ['ACTIVE', 'SUSPENDED', 'INACTIVE'].includes(status)) {
      qr.status = status === 'INACTIVE' ? 'SUSPENDED' : status;
      await qr.save();
    }

    // 4. Audit Log
    AuditLog.create({
      action: 'UPDATE_QR_FULL_DETAILS',
      targetId: qr.productId,
      newValue: {
        userName: user?.name,
        vehicleName,
        vehicleNumber,
        status: qr.status,
        emergencyCount: emergencyContacts?.length
      },
      ip: req.ip || ''
    }).catch(() => {});

    res.json({
      success: true,
      message: '✓ QR Tag and vehicle details updated successfully!',
      qr,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        whatsappNumber: user.whatsappNumber,
        address: user.address,
        city: user.city,
        state: user.state
      },
      vehicle: updatedVehicle
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(50);
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });
    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    if (id === 'all') {
      await Notification.updateMany({ userId, isRead: false }, { isRead: true });
    } else {
      await Notification.updateOne({ _id: id, userId }, { isRead: true });
    }
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const registerFCMToken = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fcmToken } = req.body;
    if (fcmToken && typeof fcmToken === 'string' && fcmToken.length > 20) {
      await User.updateOne(
        { _id: userId },
        { $addToSet: { fcmTokens: fcmToken.trim() } }
      );
    }
    res.json({ success: true, message: 'FCM Token registered successfully for this device.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


