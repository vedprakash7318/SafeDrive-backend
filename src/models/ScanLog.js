import mongoose from 'mongoose';

const scanLogSchema = new mongoose.Schema({
  qrId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRCode' },
  copyCode: { type: String, index: true },
  productId: { type: String, index: true },
  publicToken: { type: String, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  vehicleNumber: { type: String },
  eventType: {
    type: String,
    enum: [
      'SCAN_VIEW',
      'PLATE_VERIFIED',
      'PLATE_FAILED',
      'CALL_INITIATED',
      'SMS_INITIATED',
      'WHATSAPP_INITIATED',
      'PUSH_NOTIFICATION',
      'REGISTRATION_VIEW',
      'EXPIRED_VIEW',
      'SUSPENDED_VIEW'
    ],
    default: 'SCAN_VIEW'
  },
  ipAddress: { type: String },
  userAgent: { type: String },
  device: { type: String },
  callerPhone: { type: String },
  scannerPhone: { type: String },
  reason: { type: String },
  message: { type: String },
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number }
  },
  notes: { type: String }
}, { timestamps: true });

export default mongoose.model('ScanLog', scanLogSchema);
