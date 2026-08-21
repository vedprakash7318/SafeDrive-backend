import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import QRCode from '../models/QRCode.js';
import Subscription from '../models/Subscription.js';
import QuotaWallet from '../models/QuotaWallet.js';
import QuotaTransaction from '../models/QuotaTransaction.js';
import Payment from '../models/Payment.js';
import QuotaPackage from '../models/QuotaPackage.js';
import SystemSetting from '../models/SystemSetting.js';
import crypto from 'crypto';

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('-password');
    const vehicles = await Vehicle.find({ userId });
    const qrs = await QRCode.find({ userId }).populate('vehicleId');
    const wallets = await QuotaWallet.find({ userId });
    const subscriptions = await Subscription.find({ userId }).sort({ createdAt: -1 });

    const totalCallsRemaining = wallets.reduce((acc, w) => acc + (w.callBalance || 0), 0);
    const totalMessagesRemaining = wallets.reduce((acc, w) => acc + (w.messageBalance || 0), 0);
    const totalCallsUsed = wallets.reduce((acc, w) => acc + (w.totalCallsUsed || 0), 0);
    const totalMessagesUsed = wallets.reduce((acc, w) => acc + (w.totalMessagesUsed || 0), 0);

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

    // Mock payment verification
    const orderId = `ORD_${Date.now()}`;
    const paymentId = `PAY_${crypto.randomBytes(6).toString('hex')}`;

    await Payment.create({
      userId,
      orderId,
      paymentId,
      amount: pkg.price,
      purpose: pkg.category === 'CALL' ? 'CALL_PACKAGE' : 'MESSAGE_PACKAGE',
      status: 'SUCCESSFUL',
      metadata: { qrId, packageName: pkg.name, quantity: pkg.quantity }
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

    if (pkg.category === 'CALL') {
      wallet.callBalance += pkg.quantity;
      wallet.totalCallsPurchased += pkg.quantity;
      await wallet.save();

      await QuotaTransaction.create({
        userId,
        qrId: qr._id,
        type: 'CREDIT',
        category: 'CALL',
        quantity: pkg.quantity,
        balanceAfter: wallet.callBalance,
        reason: `Purchased Package: ${pkg.name} (₹${pkg.price})`
      });
    } else if (pkg.category === 'MESSAGE') {
      wallet.messageBalance += pkg.quantity;
      wallet.totalMessagesPurchased += pkg.quantity;
      await wallet.save();

      await QuotaTransaction.create({
        userId,
        qrId: qr._id,
        type: 'CREDIT',
        category: 'MESSAGE',
        quantity: pkg.quantity,
        balanceAfter: wallet.messageBalance,
        reason: `Purchased Package: ${pkg.name} (₹${pkg.price})`
      });
    }

    res.json({
      success: true,
      message: `Successfully purchased ${pkg.name}!`,
      wallet
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const renewSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const { qrId, renewalPrice } = req.body;

    const qr = await QRCode.findOne({ _id: qrId, userId });
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR Code not found' });
    }

    const settings = await SystemSetting.findOne() || {
      defaultRenewalPrice: 199,
      renewalBonusCalls: 10,
      renewalBonusMessages: 20,
      defaultValidityDays: 365
    };

    const finalPrice = renewalPrice || settings.defaultRenewalPrice;
    const bonusCalls = settings.renewalBonusCalls;
    const bonusMessages = settings.renewalBonusMessages;
    const validityDays = settings.defaultValidityDays;

    // Preserve old quota & add bonus
    let wallet = await QuotaWallet.findOne({ qrId: qr._id });
    if (!wallet) {
      wallet = await QuotaWallet.create({
        userId,
        qrId: qr._id,
        callBalance: bonusCalls,
        messageBalance: bonusMessages
      });
    } else {
      wallet.callBalance += bonusCalls;
      wallet.messageBalance += bonusMessages;
      wallet.totalCallsPurchased += bonusCalls;
      wallet.totalMessagesPurchased += bonusMessages;
      await wallet.save();
    }

    // New expiry: add validity days
    const baseDate = (qr.expiryDate && new Date(qr.expiryDate) > new Date()) ? new Date(qr.expiryDate) : new Date();
    const newExpiry = new Date(baseDate.getTime() + validityDays * 24 * 60 * 60 * 1000);

    qr.expiryDate = newExpiry;
    qr.status = 'ACTIVE';
    await qr.save();

    // Log Payment
    await Payment.create({
      userId,
      orderId: `REN_${Date.now()}`,
      paymentId: `PAY_REN_${crypto.randomBytes(6).toString('hex')}`,
      amount: finalPrice,
      purpose: 'RENEWAL',
      status: 'SUCCESSFUL',
      metadata: { qrId: qr._id, copyCode: qr.copyCode }
    });

    // Create Subscription
    await Subscription.create({
      userId,
      qrId: qr._id,
      startDate: new Date(),
      expiryDate: newExpiry,
      status: 'ACTIVE',
      renewalAmount: finalPrice
    });

    // Log Quota Transactions
    await QuotaTransaction.create({
      userId,
      qrId: qr._id,
      type: 'CREDIT',
      category: 'CALL',
      quantity: bonusCalls,
      balanceAfter: wallet.callBalance,
      reason: 'Subscription Renewal Bonus Calls'
    });

    await QuotaTransaction.create({
      userId,
      qrId: qr._id,
      type: 'CREDIT',
      category: 'MESSAGE',
      quantity: bonusMessages,
      balanceAfter: wallet.messageBalance,
      reason: 'Subscription Renewal Bonus Messages'
    });

    res.json({
      success: true,
      message: 'Subscription successfully renewed! Old quota preserved + bonus added.',
      expiryDate: qr.expiryDate,
      wallet
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
