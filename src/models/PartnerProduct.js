import mongoose from 'mongoose';

const packageSchema = new mongoose.Schema({
  quantity: { type: Number, required: true, min: 1 },
  totalPrice: { type: Number, required: true, min: 0 },
  mrp: { type: Number, required: true, min: 0 },
  discountPercent: { type: Number, default: 0, min: 0 },
  deliveryCharge: { type: Number, required: true, min: 0 },
  isOutOfStock: { type: Boolean, default: false }
});

const partnerProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  qrType: { type: String, default: 'PHYSICAL' },
  category: { type: String, trim: true }, // e.g. Car, Bike, Luggage
  description: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  imagePublicId: { type: String, default: '' },
  packages: [packageSchema],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });


export default mongoose.model('PartnerProduct', partnerProductSchema);
