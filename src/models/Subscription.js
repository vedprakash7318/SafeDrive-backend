import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qrId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRCode', required: true },
  startDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'SUSPENDED'], default: 'ACTIVE' },
  renewalAmount: { type: Number, required: true }
}, { timestamps: true });

export default mongoose.model('Subscription', subscriptionSchema);
