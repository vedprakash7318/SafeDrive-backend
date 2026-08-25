import mongoose from 'mongoose';

const qrCodeSchema = new mongoose.Schema({
  productId: { type: String, required: true }, // e.g. SD001
  batchId: { type: String, required: true },
  copyCode: { type: String, required: true, unique: true }, // e.g. SD001C1
  publicToken: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // The active QR user / vehicle owner
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // The original customer/buyer who purchased the kit
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  status: {
    type: String,
    enum: ['GENERATED', 'IN STOCK', 'SOLD', 'REGISTERED', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'],
    default: 'IN STOCK'
  },
  // Batch-configured parameters set at creation time
  qrFor: { type: String, default: 'Car' }, // Vehicle/Item type: Car, Bike, Luggage, etc.
  qrType: { type: String, default: 'PHYSICAL' }, // Physical vs Digital
  qrTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRType' },
  qrFormatId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRFormat' },
  initialCalls: { type: Number, default: null },
  initialMessages: { type: Number, default: null },
  validityDays: { type: Number, default: null },
  renewalAmount: { type: Number, default: null },

  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },

  activatedByName: { type: String },
  activatedByPhone: { type: String },
  activationPhone: { type: String },

  activationDate: { type: Date },
  expiryDate: { type: Date }
}, { timestamps: true });

export default mongoose.model('QRCode', qrCodeSchema);
