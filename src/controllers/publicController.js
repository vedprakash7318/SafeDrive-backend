import QRCode from '../models/QRCode.js';
import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import Subscription from '../models/Subscription.js';
import QuotaWallet from '../models/QuotaWallet.js';
import QuotaTransaction from '../models/QuotaTransaction.js';
import EmergencyAlert from '../models/EmergencyAlert.js';
import ScanLog from '../models/ScanLog.js';
import SystemSetting from '../models/SystemSetting.js';
import ScanReason from '../models/ScanReason.js';
import Order from '../models/Order.js';
import AuditLog from '../models/AuditLog.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const getPublicScanReasons = async (req, res) => {
  try {
    const reasons = await ScanReason.find({ isActive: true, isDeleted: { $ne: true } }).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, reasons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getQRInfoByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const qr = await QRCode.findOne({ publicToken: token })
      .populate('userId', 'name phone status email')
      .populate('vehicleId');

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';

    if (!qr) {
      return res.json({
        success: false,
        status: 'INVALID',
        message: 'Invalid or unknown QR code scanned'
      });
    }

    // Log Scan Event (with 10-second deduplication for same QR + IP to avoid React StrictMode/double mount duplicate entries)
    const eventType = qr.status === 'ACTIVE' ? 'SCAN_VIEW' : (['GENERATED', 'IN STOCK', 'SOLD'].includes(qr.status) ? 'REGISTRATION_VIEW' : 'SCAN_VIEW');
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
    
    ScanLog.findOne({
      qrId: qr._id,
      ipAddress,
      eventType,
      createdAt: { $gte: tenSecondsAgo }
    }).then((recentLog) => {
      if (!recentLog) {
        ScanLog.create({
          qrId: qr._id,
          copyCode: qr.copyCode,
          productId: qr.productId,
          publicToken: token,
          userId: qr.userId?._id,
          vehicleId: qr.vehicleId?._id,
          vehicleNumber: qr.vehicleId?.vehicleNumber,
          eventType,
          ipAddress,
          userAgent,
          device
        }).catch(() => {});
      }
    }).catch(() => {});

    if (qr.status === 'SUSPENDED') {
      return res.json({
        success: false,
        status: 'SUSPENDED',
        message: 'This QR code is currently suspended by administration'
      });
    }

    // Unregistered / Physical QR -> Directly open Registration Form
    if (['GENERATED', 'IN STOCK', 'SOLD'].includes(qr.status)) {
      return res.json({
        success: true,
        status: 'UNREGISTERED',
        productId: qr.productId,
        copyCode: qr.copyCode,
        qrFor: qr.qrFor || qr.qrType || 'Car',
        user: qr.userId ? { name: qr.userId.name, phone: qr.userId.phone, email: qr.userId.email } : null,
        message: 'This QR is ready for registration'
      });
    }

    if (qr.status === 'ACTIVE') {
      // Check for automatic expiration
      if (qr.expiryDate && new Date(qr.expiryDate) < new Date()) {
        qr.status = 'EXPIRED';
        await qr.save();
        return res.json({
          success: false,
          status: 'EXPIRED',
          copyCode: qr.copyCode,
          expiryDate: qr.expiryDate,
          message: 'This QR code has expired'
        });
      }

      // Check user wallet quota
      const wallet = await QuotaWallet.findOne({ qrId: qr._id });
      const canCall = wallet ? wallet.callBalance > 0 : false;
      const canMessage = wallet ? wallet.messageBalance > 0 : false;

      // Extract plate info
      const rawPlate = qr.vehicleId?.vehicleNumber || '';
      const cleanPlate = rawPlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const maskedPlate = cleanPlate.length >= 4 
        ? `${cleanPlate.slice(0, cleanPlate.length - 4)}${'*'.repeat(4)}`
        : '****';

      return res.json({
        success: true,
        status: 'ACTIVE',
        copyCode: qr.copyCode,
        requiresVerification: true,
        maskedPlate,
        vehicleBrand: qr.vehicleId?.vehicleBrand,
        vehicleName: qr.vehicleId?.vehicleName,
        canCall,
        canMessage,
        expiryDate: qr.expiryDate
      });
    }

    if (qr.status === 'EXPIRED') {
      return res.json({
        success: false,
        status: 'EXPIRED',
        copyCode: qr.copyCode,
        expiryDate: qr.expiryDate,
        message: 'This QR code has expired'
      });
    }

    res.json({ success: false, status: qr.status, message: `QR status: ${qr.status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const verifyPlateLast4Digits = async (req, res) => {
  try {
    const { token } = req.params;
    const { last4Digits } = req.body;

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';

    if (!last4Digits || String(last4Digits).trim().length < 4) {
      return res.status(400).json({ success: false, message: 'Please provide the 4 digits of the item tag / number plate' });
    }

    const qr = await QRCode.findOne({ publicToken: token })
      .populate('userId', 'name phone')
      .populate('vehicleId');

    if (!qr || qr.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'QR is not active' });
    }

    const fullPlate = (qr.vehicleId?.vehicleNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const inputDigits = String(last4Digits).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    // Check if input matches the last 4 characters
    const actualLast4 = fullPlate.slice(-4);

    if (inputDigits !== actualLast4) {
      // Log Failed Verification Attempt
      ScanLog.create({
        qrId: qr._id,
        copyCode: qr.copyCode,
        productId: qr.productId,
        publicToken: token,
        userId: qr.userId?._id,
        vehicleId: qr.vehicleId?._id,
        vehicleNumber: qr.vehicleId?.vehicleNumber,
        eventType: 'PLATE_FAILED',
        notes: `Entered: ${inputDigits}`,
        ipAddress,
        userAgent,
        device
      }).catch(() => {});

      return res.status(400).json({
        success: false,
        message: 'Incorrect last 4 digits. Please check the physical tag / plate.'
      });
    }

    // Log Successful Verification
    ScanLog.create({
      qrId: qr._id,
      copyCode: qr.copyCode,
      productId: qr.productId,
      publicToken: token,
      userId: qr.userId?._id,
      vehicleId: qr.vehicleId?._id,
      vehicleNumber: qr.vehicleId?.vehicleNumber,
      eventType: 'PLATE_VERIFIED',
      ipAddress,
      userAgent,
      device
    }).catch(() => {});

    const wallet = await QuotaWallet.findOne({ qrId: qr._id });
    const canCall = wallet ? wallet.callBalance > 0 : false;
    const canMessage = wallet ? wallet.messageBalance > 0 : false;

    res.json({
      success: true,
      verified: true,
      vehicle: {
        vehicleName: qr.vehicleId.vehicleName,
        vehicleBrand: qr.vehicleId.vehicleBrand,
        vehicleNumber: qr.vehicleId.vehicleNumber
      },
      owner: {
        name: qr.userId ? qr.userId.name : 'Protected Owner'
      },
      canCall,
      canMessage,
      callBalance: wallet ? wallet.callBalance : 0,
      messageBalance: wallet ? wallet.messageBalance : 0,
      expiryDate: qr.expiryDate
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const registerQR = async (req, res) => {
  try {
    const { token } = req.params;
    const {
      name,
      phone,
      whatsappNumber,
      address,
      password,
      vehicleName,
      vehicleBrand,
      vehicleNumber,
      emergencyContacts
    } = req.body;

    const qr = await QRCode.findOne({ publicToken: token });
    if (!qr) {
      return res.status(404).json({ success: false, message: 'Invalid QR Code' });
    }

    if (qr.status === 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'This QR is already registered and active.'
      });
    }

    if (!name || !phone || !vehicleNumber || !vehicleName || !vehicleBrand) {
      return res.status(400).json({
        success: false,
        message: 'Name, Phone, Vehicle Name, Brand and Vehicle Number are required'
      });
    }

    // Validate 2 emergency contacts
    if (!emergencyContacts || !Array.isArray(emergencyContacts) || emergencyContacts.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Exactly 2 emergency contacts are required for registration'
      });
    }

    // Find or create User
    let user = await User.findOne({ phone });
    if (!user) {
      const defaultPassword = password || '123456';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      user = await User.create({
        name,
        phone,
        whatsappNumber: whatsappNumber || phone,
        address: address || 'N/A',
        password: hashedPassword,
        role: 'USER'
      });
    }

    // Create Vehicle
    let vehicle = await Vehicle.findOne({ vehicleNumber: vehicleNumber.toUpperCase().trim() });
    if (!vehicle) {
      vehicle = await Vehicle.create({
        userId: user._id,
        vehicleName,
        vehicleBrand,
        vehicleNumber: vehicleNumber.toUpperCase().trim(),
        emergencyContacts: [
          { name: emergencyContacts[0].name, number: emergencyContacts[0].number },
          { name: emergencyContacts[1].name, number: emergencyContacts[1].number }
        ]
      });
    }

    // Determine quota & validity from this specific QR code batch configuration
    const initialCalls = qr.initialCalls || 10;
    const initialMessages = qr.initialMessages || 20;
    const validityDays = qr.validityDays || 365;
    const renewalAmount = qr.renewalAmount || 199;

    const now = new Date();
    const expiry = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    // 1. Find ALL sibling copies sharing this productId (e.g. SD005C1, SD005C2...)
    const siblingQRs = await QRCode.find({ productId: qr.productId });

    // 2. Activate ALL sibling copies with the exact same vehicleId, userId, and validity
    await QRCode.updateMany(
      { productId: qr.productId },
      {
        userId: user._id,
        vehicleId: vehicle._id,
        status: 'ACTIVE',
        activationDate: now,
        expiryDate: expiry
      }
    );

    // 3. Create Subscription and Initial Quota Wallet for each sibling copy
    for (const item of siblingQRs) {
      await Subscription.create({
        userId: user._id,
        qrId: item._id,
        startDate: now,
        expiryDate: expiry,
        status: 'ACTIVE',
        renewalAmount: renewalAmount
      });

      await QuotaWallet.findOneAndUpdate(
        { qrId: item._id },
        {
          userId: user._id,
          qrId: item._id,
          callBalance: initialCalls,
          messageBalance: initialMessages,
          totalCallsPurchased: initialCalls,
          totalMessagesPurchased: initialMessages
        },
        { upsert: true, new: true }
      );
    }

    // 4. Create Ledger Transactions ONCE for the entire Kit Set (productId)
    await QuotaTransaction.create({
      userId: user._id,
      qrId: qr._id,
      productId: qr.productId,
      type: 'CREDIT',
      category: 'CALL',
      quantity: initialCalls,
      balanceAfter: initialCalls,
      source: 'INITIAL_FREE',
      amountPaid: 0,
      performedBy: 'System (Kit Activation)',
      reason: 'Initial Starter Calling Quota (Included with Kit)'
    });

    await QuotaTransaction.create({
      userId: user._id,
      qrId: qr._id,
      productId: qr.productId,
      type: 'CREDIT',
      category: 'MESSAGE',
      quantity: initialMessages,
      balanceAfter: initialMessages,
      source: 'INITIAL_FREE',
      amountPaid: 0,
      performedBy: 'System (Kit Activation)',
      reason: 'Initial Starter SMS Quota (Included with Kit)'
    });

    // 5. Auto-link Order if user has an unclaimed physical order
    await Order.findOneAndUpdate(
      {
        $or: [{ customerPhone: phone }, { customerEmail: user.email }, { userId: user._id }],
        isClaimed: { $ne: true }
      },
      {
        isClaimed: true,
        claimedAt: now,
        claimedProductId: qr.productId
      }
    );

    // Record Audit Log for registration
    AuditLog.create({
      action: 'PUBLIC_QR_REGISTRATION',
      targetId: qr.productId,
      newValue: {
        userName: user.name,
        userPhone: user.phone,
        vehiclePlate: vehicle.vehicleNumber,
        vehicleName: vehicle.vehicleName,
        totalCopies: siblingQRs.length
      },
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
    }).catch(() => {});

    // Generate token for auto-login
    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'supersecretjwtkey_replace_in_prod', {
      expiresIn: '30d'
    });

    res.status(201).json({
      success: true,
      message: `🎉 All ${siblingQRs.length} QR stickers (${qr.productId}) activated successfully!`,
      token: jwtToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role
      },
      vehicle: {
        id: vehicle._id,
        vehicleName: vehicle.vehicleName,
        vehicleBrand: vehicle.vehicleBrand,
        vehicleNumber: vehicle.vehicleNumber
      },
      qr: {
        id: qr._id,
        productId: qr.productId,
        copyCode: qr.copyCode,
        totalCopiesActivated: siblingQRs.length,
        status: 'ACTIVE',
        expiryDate: expiry
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const initiateCall = async (req, res) => {
  try {
    const { token } = req.params;
    const qr = await QRCode.findOne({ publicToken: token }).populate('userId');

    if (!qr || qr.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'QR is not active' });
    }

    // Atomic server-side quota deduction
    const wallet = await QuotaWallet.findOneAndUpdate(
      { qrId: qr._id, callBalance: { $gt: 0 } },
      { $inc: { callBalance: -1, totalCallsUsed: 1 } },
      { new: true }
    );

    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Owner has exhausted available Call Quota. Please try messaging or Emergency Alert.'
      });
    }

    // Synchronize deducted balance across all sibling QR copies sharing same productId
    const siblingQRs = await QRCode.find({ productId: qr.productId });
    const siblingIds = siblingQRs.map(s => s._id);
    await QuotaWallet.updateMany(
      { qrId: { $in: siblingIds } },
      { callBalance: wallet.callBalance, totalCallsUsed: wallet.totalCallsUsed }
    );

    // Log Quota Ledger
    await QuotaTransaction.create({
      userId: qr.userId._id,
      qrId: qr._id,
      type: 'DEBIT',
      category: 'CALL',
      quantity: 1,
      balanceAfter: wallet.callBalance,
      reason: 'Public Scan Voice Call initiated'
    });

    // Log Scan Event
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';
    ScanLog.create({
      qrId: qr._id,
      copyCode: qr.copyCode,
      productId: qr.productId,
      publicToken: token,
      userId: qr.userId._id,
      vehicleId: qr.vehicleId?._id,
      vehicleNumber: qr.vehicleId?.vehicleNumber,
      eventType: 'CALL_INITIATED',
      ipAddress,
      userAgent,
      device
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Call initiated successfully',
      targetPhone: qr.userId.phone,
      remainingCalls: wallet.callBalance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const initiateMessage = async (req, res) => {
  try {
    const { token } = req.params;
    const { messageText } = req.body;
    const qr = await QRCode.findOne({ publicToken: token }).populate('userId');

    if (!qr || qr.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'QR is not active' });
    }

    // Atomic server-side quota deduction
    const wallet = await QuotaWallet.findOneAndUpdate(
      { qrId: qr._id, messageBalance: { $gt: 0 } },
      { $inc: { messageBalance: -1, totalMessagesUsed: 1 } },
      { new: true }
    );

    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Owner has exhausted available Message Quota.'
      });
    }

    // Synchronize deducted message balance across all sibling QR copies
    const siblingQRs = await QRCode.find({ productId: qr.productId });
    const siblingIds = siblingQRs.map(s => s._id);
    await QuotaWallet.updateMany(
      { qrId: { $in: siblingIds } },
      { messageBalance: wallet.messageBalance, totalMessagesUsed: wallet.totalMessagesUsed }
    );

    // Log Quota Ledger
    await QuotaTransaction.create({
      userId: qr.userId._id,
      qrId: qr._id,
      type: 'DEBIT',
      category: 'MESSAGE',
      quantity: 1,
      balanceAfter: wallet.messageBalance,
      reason: 'Public Scan SMS/WhatsApp Notification sent'
    });

    // Log Scan Event
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';
    ScanLog.create({
      qrId: qr._id,
      copyCode: qr.copyCode,
      productId: qr.productId,
      publicToken: token,
      userId: qr.userId._id,
      vehicleId: qr.vehicleId?._id,
      vehicleNumber: qr.vehicleId?.vehicleNumber,
      eventType: 'WHATSAPP_INITIATED',
      notes: messageText,
      ipAddress,
      userAgent,
      device
    }).catch(() => {});

    const targetPhone = qr.userId.whatsappNumber || qr.userId.phone;
    const defaultMsg = encodeURIComponent(messageText || `Hello, I am reaching out regarding your vehicle (Safe Drive QR).`);
    const whatsappUrl = `https://wa.me/91${targetPhone.replace(/\D/g, '').slice(-10)}?text=${defaultMsg}`;

    res.json({
      success: true,
      message: 'Message quota deducted. Notification initiated.',
      whatsappUrl,
      remainingMessages: wallet.messageBalance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const triggerEmergency = async (req, res) => {
  try {
    const { token } = req.params;
    const { latitude, longitude, mapsLink } = req.body;

    const qr = await QRCode.findOne({ publicToken: token })
      .populate('userId')
      .populate('vehicleId');

    if (!qr) {
      return res.status(404).json({ success: false, message: 'Invalid QR' });
    }

    const contacts = qr.vehicleId?.emergencyContacts || [];
    const generatedMapsLink = mapsLink || (latitude && longitude ? `https://maps.google.com/?q=${latitude},${longitude}` : null);

    const alert = await EmergencyAlert.create({
      qrId: qr._id,
      vehicleId: qr.vehicleId?._id,
      userId: qr.userId?._id,
      publicToken: token,
      vehicleNumber: qr.vehicleId?.vehicleNumber || 'N/A',
      ownerName: qr.userId?.name || 'N/A',
      ip: req.ip || 'Unknown',
      device: req.headers['user-agent'] || 'Mobile Device',
      location: {
        latitude: latitude || null,
        longitude: longitude || null,
        mapsLink: generatedMapsLink
      },
      notifiedContacts: contacts
    });

    // Log Scan Event
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';
    ScanLog.create({
      qrId: qr._id,
      copyCode: qr.copyCode,
      productId: qr.productId,
      publicToken: token,
      userId: qr.userId?._id,
      vehicleId: qr.vehicleId?._id,
      vehicleNumber: qr.vehicleId?.vehicleNumber,
      eventType: 'SCAN_VIEW',
      notes: 'Emergency SOS Triggered',
      ipAddress,
      userAgent,
      device
    }).catch(() => {});

    const locationText = generatedMapsLink ? `%0A📍 Live Incident Location: ${encodeURIComponent(generatedMapsLink)}` : '';
    const alertMessage = `🚨 *SAFE DRIVE EMERGENCY ALERT* 🚨%0A%0AVehicle Plate: *${qr.vehicleId?.vehicleNumber}*%0AOwner: *${qr.userId?.name}*%0AStatus: Emergency Alert Triggered via Vehicle QR Scan!${locationText}%0A%0APlease respond or contact immediately.`;

    const formattedContacts = contacts.map(c => {
      const cleanPhone = c.number.replace(/\D/g, '').slice(-10);
      return {
        name: c.name,
        number: c.number,
        whatsappLink: `https://wa.me/91${cleanPhone}?text=${alertMessage}`
      };
    });

    res.json({
      success: true,
      message: '🚨 Emergency alert logged! Live GPS location dispatched.',
      alertId: alert._id,
      mapsLink: generatedMapsLink,
      emergencyContacts: formattedContacts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * FIRST-TIME PHYSICAL QR STICKER CLAIM & VERIFICATION
 */
export const claimPhysicalQR = async (req, res) => {
  try {
    const { token } = req.params;
    const { emailOrPhone } = req.body;

    if (!emailOrPhone) {
      return res.status(400).json({ success: false, message: 'Please enter your order email or phone number.' });
    }

    const cleanInput = emailOrPhone.trim().toLowerCase();

    const qr = await QRCode.findOne({ publicToken: token });
    if (!qr) {
      return res.status(404).json({ success: false, message: 'Invalid or unknown QR code scanned.' });
    }

    if (qr.status === 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'This QR code is already registered and active.' });
    }

    // Search for an unclaimed physical order matching this email or phone
    // Prioritize matching the exact QR category (e.g. Car vs Bike) first
    const qrCategory = qr.qrFor || qr.qrType || 'Car';
    let order = await Order.findOne({
      $or: [
        { customerEmail: cleanInput },
        { customerPhone: cleanInput }
      ],
      productType: 'PHYSICAL',
      qrFor: qrCategory,
      isClaimed: false,
      paymentStatus: 'PAID'
    }).sort({ createdAt: 1 }); // FIFO - oldest order claimed first

    // If no category-specific order found, check any physical unclaimed order for this customer
    if (!order) {
      order = await Order.findOne({
        $or: [
          { customerEmail: cleanInput },
          { customerPhone: cleanInput }
        ],
        productType: 'PHYSICAL',
        isClaimed: false,
        paymentStatus: 'PAID'
      }).sort({ createdAt: 1 });
    }

    if (!order) {
      return res.status(400).json({
        success: false,
        message: '❌ No eligible physical order found for this email or phone number. Please enter the exact email or phone number used when placing your order, or check if your order has already been activated.'
      });
    }

    const user = await User.findById(order.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found for this order.' });
    }

    // Find all sibling QR stickers sharing the same productId (e.g. SD007C1 and SD007C2)
    const targetProductId = qr.productId;
    const siblingQRs = await QRCode.find({ productId: targetProductId });

    await QRCode.updateMany(
      { productId: targetProductId },
      {
        status: 'SOLD',
        userId: user._id,
        initialCalls: order.metadata?.initialCalls || 10,
        initialMessages: order.metadata?.initialMessages || 20,
        validityDays: order.metadata?.validityDays || 365,
        renewalAmount: order.metadata?.renewalAmount || 199
      }
    );

    // Mark order as claimed
    order.isClaimed = true;
    order.claimedAt = new Date();
    order.claimedProductId = targetProductId;
    order.allocatedQRIds = siblingQRs.map(q => q._id);
    await order.save();

    res.json({
      success: true,
      verified: true,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        address: user.address
      },
      qr: {
        productId: qr.productId,
        copyCode: qr.copyCode,
        qrFor: qr.qrFor || 'Car'
      },
      message: '🎉 Order verified! This QR kit is now linked to your account. Please complete your vehicle details to activate.'
    });
  } catch (error) {
    console.error('Claim QR error:', error);
    res.status(500).json({ success: false, message: error.message || 'Error claiming physical QR kit.' });
  }
};

/**
 * Send OTP for First-Time QR Activation
 * Works for any 10-digit mobile number with fixed test OTP (123456)
 */
export const sendActivationOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    const cleanPhone = (phone || '').trim().replace(/\D/g, '').slice(-10);

    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    // Check if user exists in database
    const existingUser = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+91${cleanPhone}` },
        { phone: `91${cleanPhone}` }
      ]
    });

    if (existingUser && existingUser.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended. Please contact administrator.'
      });
    }

    res.json({
      success: true,
      message: `OTP sent to mobile +91 ${cleanPhone}`,
      phone: cleanPhone,
      otp: '123456',
      userExists: !!existingUser,
      user: existingUser ? {
        name: existingUser.name,
        phone: existingUser.phone,
        email: existingUser.email,
        whatsappNumber: existingUser.whatsappNumber,
        address: existingUser.address
      } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Verify OTP for First-Time QR Activation
 */
export const verifyActivationOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const cleanPhone = (phone || '').trim().replace(/\D/g, '').slice(-10);
    const cleanOtp = (otp || '').trim();

    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Invalid mobile number' });
    }

    if (cleanOtp !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid OTP code. Please enter 123456' });
    }

    const existingUser = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+91${cleanPhone}` },
        { phone: `91${cleanPhone}` }
      ]
    });

    res.json({
      success: true,
      verified: true,
      phone: cleanPhone,
      userExists: !!existingUser,
      user: existingUser ? {
        name: existingUser.name,
        phone: existingUser.phone,
        email: existingUser.email,
        whatsappNumber: existingUser.whatsappNumber,
        address: existingUser.address
      } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
