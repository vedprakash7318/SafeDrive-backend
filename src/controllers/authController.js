import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import QRCode from '../models/QRCode.js';
import QuotaWallet from '../models/QuotaWallet.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'supersecretjwtkey_replace_in_prod', {
    expiresIn: '30d'
  });
};

export const register = async (req, res) => {
  try {
    const { name, phone, email, whatsappNumber, address, password, role } = req.body;
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
      whatsappNumber: whatsappNumber || phone,
      address: address || 'N/A',
      password: hashedPassword,
      role: role || 'USER'
    });

    const token = generateToken(user._id);
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        whatsappNumber: user.whatsappNumber,
        address: user.address,
        role: user.role
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
      existingUser.role = role || 'SUPER_ADMIN';
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
      whatsappNumber: phone,
      address: 'Safe Drive Corporate HQ',
      password: hashedPassword,
      role: role || 'SUPER_ADMIN',
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
        whatsappNumber: user.whatsappNumber,
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

    res.json({
      success: true,
      message: `Login OTP sent to mobile +91 ${cleanPhone}`,
      phone: cleanPhone,
      isNewUser: !user,
      otp: '123456'
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

    if (cleanOtp !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid OTP verification code. Please enter 123456' });
    }

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
        whatsappNumber: cleanPhone,
        role: 'USER',
        status: 'ACTIVE',
        address: ''
      });
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
        whatsappNumber: user.whatsappNumber,
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
