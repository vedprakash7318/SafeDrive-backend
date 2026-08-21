import mongoose from 'mongoose';

const quotaPackageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, enum: ['CALL', 'MESSAGE', 'RENEWAL'], required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  durationDays: { type: Number, default: 365 },
  bonusCalls: { type: Number, default: 0 },
  bonusMessages: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('QuotaPackage', quotaPackageSchema);
