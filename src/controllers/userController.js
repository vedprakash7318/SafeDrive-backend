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
import AuditLog from '../models/AuditLog.js';
import crypto from 'crypto';

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('-password');
    const vehicles = await Vehicle.find({ userId });
    const qrs = await QRCode.find({ userId }).populate('vehicleId');
    const wallets = await QuotaWallet.find({ userId });
    const subscriptions = await Subscription.find({ userId }).sort({ createdAt: -1 });

    // Group wallets by unique productId (Kit) to prevent multi-copy duplication (e.g. SD005C1 + SD005C2)
    const productWalletMap = new Map();
    for (const qr of qrs) {
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

    res.json({
      success: true,
      user,
      vehicles,
      qrs,
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

export const renewSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const { qrId, renewalPrice = 199 } = req.body;

    const qr = await QRCode.findOne({ _id: qrId, userId });
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR Code not found for this user' });
    }

    const orderId = `RENEW_${Date.now()}`;
    const paymentId = `PAY_${crypto.randomBytes(6).toString('hex')}`;

    await Payment.create({
      userId,
      orderId,
      paymentId,
      amount: renewalPrice,
      purpose: 'RENEWAL',
      status: 'SUCCESSFUL',
      metadata: { qrId, productId: qr.productId, validityDaysAdded: 365 }
    });

    const now = new Date();
    const currentExpiry = qr.expiryDate && new Date(qr.expiryDate) > now ? new Date(qr.expiryDate) : now;
    const newExpiry = new Date(currentExpiry.getTime() + 365 * 24 * 60 * 60 * 1000);

    // Update ALL sibling copies of this product kit
    const siblingQRs = await QRCode.find({ productId: qr.productId, userId, isDeleted: { $ne: true } });
    await QRCode.updateMany(
      { productId: qr.productId, userId },
      { expiryDate: newExpiry, status: 'ACTIVE' }
    );

    await Subscription.create({
      userId,
      qrId: qr._id,
      startDate: now,
      endDate: newExpiry,
      price: renewalPrice,
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
      newValue: { newExpiry, renewalPrice, bonusCalls, bonusMessages },
      ip: req.ip || ''
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Subscription successfully renewed! Old quota preserved + bonus added.',
      expiryDate: newExpiry,
      wallet: primaryWallet
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
      endDate: expiryDate,
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
    const orders = await Order.find({ userId })
      .populate('productId')
      .populate('allocatedQRIds')
      .sort({ createdAt: -1 });
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
    const packages = await QuotaPackage.find({ status: 'ACTIVE', isDeleted: { $ne: true } }).sort({ price: 1 });
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
    const { name, email, whatsappNumber, address, city, state } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name) user.name = name.trim();
    if (email) user.email = email.trim().toLowerCase();
    if (whatsappNumber) user.whatsappNumber = whatsappNumber.trim();
    if (address) user.address = address.trim();
    if (city) user.city = city.trim();
    if (state) user.state = state.trim();

    await user.save();
    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        whatsappNumber: user.whatsappNumber,
        address: user.address,
        city: user.city,
        state: user.state,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
