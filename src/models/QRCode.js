import mongoose from 'mongoose';

const qrCodeSchema = new mongoose.Schema({
  productId: { type: String, required: true }, // e.g. SD001
  batchId: { type: String, required: true },
  copyCode: { type: String, required: true, unique: true }, // e.g. SD001C1
  publicToken: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  status: { 
    type: String, 
    enum: ['GENERATED', 'IN STOCK', 'SOLD', 'REGISTERED', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'],
    default: 'IN STOCK'
  },
  // Batch-configured parameters set at creation time
  qrType: { type: String, default: 'Standard Sticker' },
  qrTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRType' },
  initialCalls: { type: Number, default: 10 },
  initialMessages: { type: Number, default: 20 },
  validityDays: { type: Number, default: 365 },
  renewalAmount: { type: Number, default: 199 },

  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },

  activationDate: { type: Date },
  expiryDate: { type: Date }
}, { timestamps: true });

export default mongoose.model('QRCode', qrCodeSchema);
