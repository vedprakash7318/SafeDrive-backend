import User from '../models/User.js';
import QRCode from '../models/QRCode.js';
import Vehicle from '../models/Vehicle.js';
import EmailOTP from '../models/EmailOTP.js';
import PhoneOTP from '../models/PhoneOTP.js';
import { sendSMS } from '../utils/smsService.js';
import jwt from 'jsonwebtoken';

// Send Login OTP
export const sendDealerLoginOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    const cleanPhone = (phone || '').trim().replace(/\D/g, '').slice(-10);
    
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    const user = await User.findOne({ phone: cleanPhone, role: 'DEALER' });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Dealer not found' });
    }
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    await PhoneOTP.deleteMany({ phone: cleanPhone });
    await PhoneOTP.create({
      phone: cleanPhone,
      otp: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });
    
    await sendSMS(cleanPhone, otp);

    res.json({ success: true, message: `OTP sent to +91 ${cleanPhone}`, phone: cleanPhone });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Dealer Login
export const dealerLogin = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const cleanPhone = (phone || '').trim().replace(/\D/g, '').slice(-10);
    const cleanOtp = (otp || '').trim();

    const user = await User.findOne({ phone: cleanPhone, role: 'DEALER' });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Dealer not found or unauthorized' });
    }

    const validOtpRecord = await PhoneOTP.findOne({
      phone: cleanPhone,
      otp: cleanOtp,
      expiresAt: { $gt: new Date() }
    });

    if (!validOtpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
    }
    
    validOtpRecord.verified = true;
    await validOtpRecord.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'supersecretjwtkey_replace_in_prod',
      { expiresIn: '30d' }
    );
    res.json({
      success: true,
      token,
      dealer: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get Assigned QRs
export const getAssignedQRs = async (req, res) => {
  try {
    const qrs = await QRCode.find({ dealerId: req.user._id })
      .populate('qrTypeId', 'name')
      .populate('qrFormatId', 'name')
      .populate('userId', 'name phone email')
      .populate('vehicleId', 'vehicleNumber vehicleBrand vehicleModel itemName itemType')
      .sort({ createdAt: -1 });
      
    // Fetch system settings for dynamic dashboard message
    const { default: SystemSetting } = await import('../models/SystemSetting.js');
    const settings = await SystemSetting.findOne();
    const dashboardMessage = settings?.partnerDashboardMessage || 'Welcome to your new Partner Portal. Manage your inventory, activate tags for your customers, and track your sales all in one place.';

    res.json({ success: true, qrs, dashboardMessage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Send OTP
export const sendDealerOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    const cleanPhone = (phone || '').trim().replace(/\D/g, '').slice(-10);
    
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    await PhoneOTP.deleteMany({ phone: cleanPhone });
    await PhoneOTP.create({
      phone: cleanPhone,
      otp: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });
    
    await sendSMS(cleanPhone, otp);

    res.json({ success: true, message: `OTP sent to +91 ${cleanPhone}`, phone: cleanPhone });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Verify OTP
export const verifyDealerOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const cleanPhone = (phone || '').trim().replace(/\D/g, '').slice(-10);
    const cleanOtp = (otp || '').trim();
    
    const validOtpRecord = await PhoneOTP.findOne({
      phone: cleanPhone,
      otp: cleanOtp,
      expiresAt: { $gt: new Date() }
    });

    if (!validOtpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
    }
    
    validOtpRecord.verified = true;
    await validOtpRecord.save();
    
    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Activate QR (Direct Sell)
export const activateQR = async (req, res) => {
  try {
    const { 
      qrId, customerName, customerPhone, customerEmail, 
      vehicleNumber, vehicleBrand, vehicleModel, itemName, itemType, sellingPrice,
      gender, emergencyContact1Name, emergencyContact1Phone, emergencyContact2Name, emergencyContact2Phone 
    } = req.body;
    const dealerId = req.user._id;
    const qr = await QRCode.findOne({ _id: qrId, dealerId, status: 'ASSIGNED_TO_DEALER' });
    
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR code not found or already activated' });
    }
    
    let user = await User.findOne({ phone: customerPhone });
    if (!user) {
      user = await User.create({
        name: customerName,
        phone: customerPhone,
        email: customerEmail || '',
        role: 'USER',
        userType: 'QR_USER',
        registeredVia: 'DEALER_ACTIVATION',
        gender: gender || 'MALE'
      });
    } else {
      if (gender) {
        user.gender = gender;
        await user.save();
      }
    }

    const isLuggage = qr.qrFor === 'Luggage';

    const emergencyContacts = [];
    if (emergencyContact1Name && emergencyContact1Phone) {
      emergencyContacts.push({ name: emergencyContact1Name, number: emergencyContact1Phone });
    }
    if (emergencyContact2Name && emergencyContact2Phone) {
      emergencyContacts.push({ name: emergencyContact2Name, number: emergencyContact2Phone });
    }

    const vehicle = await Vehicle.create({
      userId: user._id,
      isVehicle: !isLuggage,
      itemName: isLuggage ? itemName || 'Luggage Item' : '',
      itemType: isLuggage ? itemType || 'Bag' : '',
      vehicleName: !isLuggage ? vehicleModel || 'Vehicle' : '',
      vehicleBrand: !isLuggage ? vehicleBrand || 'Brand' : '',
      vehicleModel: !isLuggage ? vehicleModel || '' : '',
      vehicleNumber: !isLuggage ? vehicleNumber || 'NA' : '',
      status: 'ACTIVE',
      emergencyContacts
    });

    qr.status = 'ACTIVE';
    qr.userId = user._id;
    qr.vehicleId = vehicle._id;
    qr.activationDate = new Date();
    qr.activatedByName = req.user.name;
    qr.activatedByPhone = req.user.phone;
    if (sellingPrice !== undefined) {
      qr.sellingPrice = Number(sellingPrice);
    }
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    qr.expiryDate = expiry;
    await qr.save();
    
    res.json({ success: true, message: 'QR activated successfully!', qr });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};