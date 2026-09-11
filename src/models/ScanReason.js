import mongoose from 'mongoose';

const scanReasonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  iconKey: { type: String, default: '⚠️' },
  color: { type: String, default: '#4f46e5' },
  applicableTo: { type: mongoose.Schema.Types.ObjectId, ref: 'QRType', default: null },
  isOtherType: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('ScanReason', scanReasonSchema);
