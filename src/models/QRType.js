import mongoose from 'mongoose';

const qrTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // e.g. "Car", "Bike", "Luggage"
  code: { type: String, trim: true },
  description: { type: String, default: '' },
  material: { type: String, default: 'Reflective Weatherproof Sticker' },
  copiesPerSet: { type: Number, default: 2, min: 1, max: 20 },
  price: { type: Number, default: 299 },
  features: {
    type: [String],
    default: [
      'Reflective & UV Weatherproof',
      'Instant Masked Calling to Owner',
      'WhatsApp Emergency Direct Connect',
      'Anti-Harassment Plate Verification',
      'Free 1-Year Cloud Protection'
    ]
  },
  isActive: { type: Boolean, default: true },
  totalSets: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('QRType', qrTypeSchema);
