import QRCode from '../models/QRCode.js';
import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import Subscription from '../models/Subscription.js';
import QuotaWallet from '../models/QuotaWallet.js';
import QuotaTransaction from '../models/QuotaTransaction.js';
import EmergencyAlert from '../models/EmergencyAlert.js';
import SystemSetting from '../models/SystemSetting.js';
import ScanReason from '../models/ScanReason.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const DEFAULT_REASONS = [
  { title: 'Wrong parking', iconKey: 'ban', color: 'red', isOtherType: false, order: 1 },
  { title: 'Window or gate unlocked', iconKey: 'unlock', color: 'green', isOtherType: false, order: 2 },
  { title: 'Car is going', iconKey: 'car', color: 'blue', isOtherType: false, order: 3 },
  { title: 'Accident', iconKey: 'alert', color: 'rose', isOtherType: false, order: 4 },
  { title: 'Other (Please specify)', iconKey: 'other', color: 'purple', isOtherType: true, order: 5 }
];

export const getPublicScanReasons = async (req, res) => {
  try {
    const totalEver = await ScanReason.countDocuments();
    if (totalEver === 0) {
      await ScanReason.insertMany(DEFAULT_REASONS);
    }
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
      .populate('userId', 'name phone status')
      .populate('vehicleId');

    if (!qr) {
      return res.json({
        success: false,
        status: 'INVALID',
        message: 'Invalid or unknown QR code scanned'
      });
    }

    if (qr.status === 'SUSPENDED') {
      return res.json({
        success: false,
        status: 'SUSPENDED',
        message: 'This QR code is currently suspended by administration'
      });
    }

    if (['GENERATED', 'IN STOCK', 'SOLD'].includes(qr.status)) {
      return res.json({
        success: true,
        status: 'UNREGISTERED',
        productId: qr.productId,
        copyCode: qr.copyCode,
        message: 'This QR is ready for first-time vehicle registration'
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

    if (!last4Digits || String(last4Digits).trim().length < 4) {
      return res.status(400).json({ success: false, message: 'Please provide the 4 digits of the vehicle number plate' });
    }

    const qr = await QRCode.findOne({ publicToken: token })
      .populate('userId', 'name phone')
      .populate('vehicleId');

    if (!qr || qr.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'QR is not active' });
    }

    const fullPlate = (qr.vehicleId?.vehicleNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const inputDigits = String(last4Digits).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    // Check if input matches the last 4 characters of the number plate
    const actualLast4 = fullPlate.slice(-4);

    if (inputDigits !== actualLast4) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect last 4 digits. Please check the vehicle physical plate.'
      });
    }

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

    // Activate QR
    const now = new Date();
    const expiry = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    qr.userId = user._id;
    qr.vehicleId = vehicle._id;
    qr.status = 'ACTIVE';
    qr.activationDate = now;
    qr.expiryDate = expiry;
    await qr.save();

    // Create Subscription
    await Subscription.create({
      userId: user._id,
      qrId: qr._id,
      startDate: now,
      expiryDate: expiry,
      status: 'ACTIVE',
      renewalAmount: renewalAmount
    });

    // Create Initial Quota Wallet based on this specific QR configuration
    const wallet = await QuotaWallet.create({
      userId: user._id,
      qrId: qr._id,
      callBalance: initialCalls,
      messageBalance: initialMessages,
      totalCallsPurchased: initialCalls,
      totalMessagesPurchased: initialMessages
    });

    // Create Ledger Transactions
    await QuotaTransaction.create({
      userId: user._id,
      qrId: qr._id,
      type: 'CREDIT',
      category: 'CALL',
      quantity: initialCalls,
      balanceAfter: initialCalls,
      reason: 'Initial QR Activation Quota'
    });

    await QuotaTransaction.create({
      userId: user._id,
      qrId: qr._id,
      type: 'CREDIT',
      category: 'MESSAGE',
      quantity: initialMessages,
      balanceAfter: initialMessages,
      reason: 'Initial QR Activation Quota'
    });

    // Generate token for auto-login
    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'supersecretjwtkey_replace_in_prod', {
      expiresIn: '30d'
    });

    res.status(201).json({
      success: true,
      message: 'Vehicle registration & QR activation successful!',
      token: jwtToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone
      },
      qr: {
        copyCode: qr.copyCode,
        expiryDate: qr.expiryDate,
        callBalance: wallet.callBalance,
        messageBalance: wallet.messageBalance
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
