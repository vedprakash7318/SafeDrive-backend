import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // Product Title / Name
  title: { type: String, trim: true }, // Alias for name
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 }, // Selling / Discounted Price (₹)
  originalPrice: { type: Number, default: 0, min: 0 }, // Original MRP (₹)
  discount: { type: Number, default: 0, min: 0 }, // Discount % or flat amount
  discountPercent: { type: Number, default: 0, min: 0 }, // Discount Percentage
  imageUrl: { type: String, default: '' },
  imagePublicId: { type: String, default: '' },
  qrType: { type: String, required: true, enum: ['PHYSICAL', 'DIGITAL'], default: 'PHYSICAL' }, // PHYSICAL or DIGITAL
  initialCalls: { type: Number, default: 10, min: 0 }, // Free voice calls quota
  initialMessages: { type: Number, default: 20, min: 0 }, // Free message/SMS quota
  validityDays: { type: Number, default: 365, min: 1 }, // Cloud validity in days
  renewalAmount: { type: Number, default: 199, min: 0 }, // Annual renewal price (₹)
  features: {
    type: [String],
    default: [
      'Reflective UV Weatherproof Stickers',
      'Instant Masked Calling to Owner',
      'WhatsApp Emergency Direct Connect',
      'Anti-Harassment Plate Verification',
      'Free 1-Year Cloud Protection'
    ]
  },
  soldCount: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('Product', productSchema);
