import mongoose from 'mongoose';

const qrFormatSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Physical Sticker", "Digital E-QR"
    type: { type: String, enum: ['PHYSICAL', 'DIGITAL'], required: true, default: 'PHYSICAL' },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model('QRFormat', qrFormatSchema);
