import mongoose from 'mongoose';

const qrTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // e.g. "Standard Sticker", "Metal Card"
  code: { type: String, trim: true }, // e.g. "STANDARD_STICKER"
  description: { type: String, default: '' },
  material: { type: String, default: 'Vinyl Sticker' },
  copiesPerSet: { type: Number, default: 2, min: 1, max: 20 },
  isActive: { type: Boolean, default: true },
  totalSets: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('QRType', qrTypeSchema);
