import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, trim: true, lowercase: true },
  whatsappNumber: { type: String },
  address: { type: String, default: 'N/A' },
  city: { type: String },
  state: { type: String },
  pincode: { type: String },
  gender: {
    type: String,
    enum: ['MALE', 'FEMALE', 'OTHER', 'NOT_SPECIFIED', 'Male', 'Female', 'Other', 'male', 'female', 'other'],
    default: 'MALE',
    set: v => (v ? v.toString().toUpperCase() : 'MALE')
  },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
  role: { type: String, enum: ['USER', 'ADMIN', 'SUPER_ADMIN'], default: 'USER' },
  userType: { type: String, enum: ['USER', 'BUYER', 'QR_USER', 'BOTH'], default: 'USER' },
  registeredVia: { type: String, enum: ['STORE_PURCHASE', 'QR_SCAN_ACTIVATION', 'DIRECT_REGISTRATION'], default: 'STORE_PURCHASE' },
  password: { type: String }, // Optional for passwordless OTP users
  fcmTokens: [{ type: String }]
}, { timestamps: true });

export default mongoose.model('User', userSchema);
