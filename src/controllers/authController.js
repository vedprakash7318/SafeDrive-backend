import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import QRCode from '../models/QRCode.js';
import QuotaWallet from '../models/QuotaWallet.js';
import PhoneOTP from '../models/PhoneOTP.js';
import { sendPartnerWelcomeEmail, sendUserWelcomeEmail } from '../utils/emailService.js';
import { sendSMS } from '../utils/smsService.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'supersecretjwtkey_replace_in_prod', {
    expiresIn: '30d'
  });
};

export const register = async (req, res) => {
  try {
    const { name, phone, email, address, password, role } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Name, phone and password are required' });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this phone number already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      phone,
      email: email ? email.toLowerCase().trim() : undefined,
            address: address || 'N/A',
      password: hashedPassword,
      role: role || 'USER'
    });

    const token = generateToken(user._id);

    if (user.email) {
      await sendUserWelcomeEmail(user.email, user.name, user.phone);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        address: user.address,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const registerPartner = async (req, res) => {
  try {
    const { name, phone, email, address, otp, shopName, city, state, pincode, landmark, gender } = req.body;
    if (!name || !phone || !otp) {
      return res.status(400).json({ success: false, message: 'Name, phone and OTP are required' });
    }

    const validOtpRecord = await PhoneOTP.findOne({
      phone: phone,
      otp: otp.trim(),
      expiresAt: { $gt: new Date() }
    });

    if (!validOtpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
    }

    validOtpRecord.verified = true;
    await validOtpRecord.save();

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this phone number already exists' });
    }

    const user = await User.create({
      name,
      phone,
      email: email ? email.toLowerCase().trim() : undefined,
      address: address || 'N/A',
      role: 'DEALER',
      shopName,
      city,
      state,
      pincode,
      landmark,
      gender: gender || 'MALE',
      isVerifiedPartner: false
    });

    const token = generateToken(user._id);

    if (user.email) {
      const partnerUrl = process.env.PARTNER_URL || 'http://localhost:5174'; 
      await sendPartnerWelcomeEmail(user.email, user.name, user.phone, partnerUrl);
    }

    res.status(201).json({
      success: true,
      message: 'Partner Registration successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isVerifiedPartner: user.isVerifiedPartner
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CREATE / SETUP ADMIN ENDPOINT (FOR POSTMAN)
 */
export const createAdmin = async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Name, phone, and password are required.' });
    }

    const existingUser = await User.findOne({ $or: [{ phone }, { email: email?.toLowerCase().trim() }] });
    const hashedPassword = await bcrypt.hash(password, 10);

    if (existingUser) {
      existingUser.name = name;
      existingUser.role = role || 'ADMIN';
      existingUser.password = hashedPassword;
      existingUser.status = 'ACTIVE';
      if (email) existingUser.email = email.toLowerCase().trim();
      await existingUser.save();

      const token = generateToken(existingUser._id);
      return res.json({
        success: true,
        message: 'Admin account updated/setup successfully!',
        token,
        admin: {
          id: existingUser._id,
          name: existingUser.name,
          phone: existingUser.phone,
          email: existingUser.email,
          role: existingUser.role,
          status: existingUser.status
        }
      });
    }

    const admin = await User.create({
      name,
      phone,
      email: email ? email.toLowerCase().trim() : 'admin@safedrive.com',
            address: 'Safe Drive Corporate HQ',
      password: hashedPassword,
      role: role || 'ADMIN',
      status: 'ACTIVE'
    });

    const token = generateToken(admin._id);
    res.status(201).json({
      success: true,
      message: 'Admin account created successfully!',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        phone: admin.phone,
        email: admin.email,
        role: admin.role,
        status: admin.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { phone, email, emailOrPhone, password } = req.body;
    const identifier = (emailOrPhone || phone || email || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Phone/Email and password are required' });
    }

    const user = await User.findOne({
      $or: [{ phone: identifier }, { email: identifier.toLowerCase() }]
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid phone/email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ success: false, message: 'Account is suspended. Please contact administrator.' });
    }

    const token = generateToken(user._id);
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        address: user.address,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send Login OTP to User's Mobile Number (Auto creates account for new users)
 */
export const sendLoginOTP = async (req, res) => {
  try {
    const { phone, identifier } = req.body;
    const cleanPhone = (phone || identifier || '').trim().replace(/\D/g, '').slice(-10);

    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number.' });
    }

    // Find User by mobile number if existing
    const user = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+91${cleanPhone}` },
        { phone: `91${cleanPhone}` }
      ]
    });

    if (user && user.status === 'SUSPENDED') {
      return res.status(403).json({ success: false, message: 'Your account is suspended. Please contact support.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Save to DB (expires in 10 minutes)
    await PhoneOTP.create({
      phone: cleanPhone,
      otp: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 mins
    });

    // Send SMS
    await sendSMS(cleanPhone, otp);

    res.json({
      success: true,
      message: `Login OTP sent to mobile +91 ${cleanPhone}`,
      phone: cleanPhone,
      isNewUser: !user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Verify Login OTP and issue Auth Token (Auto-creates account if new user)
 */
export const verifyLoginOTP = async (req, res) => {
  try {
    const { phone, identifier, otp } = req.body;
    const cleanPhone = (phone || identifier || '').trim().replace(/\D/g, '').slice(-10);
    const cleanOtp = (otp || '').trim();

    if (!cleanPhone || cleanPhone.length < 10 || !cleanOtp) {
      return res.status(400).json({ success: false, message: '10-digit mobile number and OTP code are required.' });
    }

    const validOtpRecord = await PhoneOTP.findOne({
      phone: cleanPhone,
      otp: cleanOtp,
      expiresAt: { $gt: new Date() }
    });

    if (!validOtpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP verification code.' });
    }

    validOtpRecord.verified = true;
    await validOtpRecord.save();

    let user = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+91${cleanPhone}` },
        { phone: `91${cleanPhone}` }
      ]
    });

    let isNewUser = false;

    // If user does not exist, automatically register new user account
    if (!user) {
      isNewUser = true;
      user = await User.create({
        name: `User ${cleanPhone.slice(-4)}`,
        phone: cleanPhone,
                role: 'USER',
        status: 'ACTIVE',
        address: ''
      });

      if (user.email) {
        await sendUserWelcomeEmail(user.email, user.name, user.phone);
      }
    } else if (user.status === 'SUSPENDED') {
      return res.status(403).json({ success: false, message: 'Your account is suspended. Please contact support.' });
    }

    const token = generateToken(user._id);
    res.json({
      success: true,
      message: isNewUser ? 'Welcome! Account created and logged in successfully.' : 'Login successful!',
      token,
      isNewUser,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        address: user.address,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = req.user;
    const vehicles = await Vehicle.find({ userId: user._id });
    const qrs = await QRCode.find({ userId: user._id }).populate('vehicleId');
    const wallets = await QuotaWallet.find({ userId: user._id });

    res.json({
      success: true,
      user,
      vehicles,
      qrs,
      wallets
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
