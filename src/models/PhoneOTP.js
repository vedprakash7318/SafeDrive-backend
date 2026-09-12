import mongoose from 'mongoose';

const phoneOTPSchema = new mongoose.Schema({
  phone: { type: String, required: true, trim: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verified: { type: Boolean, default: false }
}, { timestamps: true });

// Auto expire OTP records after document expiresAt time
phoneOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PhoneOTP', phoneOTPSchema);
