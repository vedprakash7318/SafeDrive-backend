import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['CALL_ALERT', 'MESSAGE_ALERT', 'EMERGENCY_ALERT', 'SYSTEM', 'QUOTA_LOW'],
    default: 'MESSAGE_ALERT'
  },
  qrId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRCode' },
  vehicleNumber: { type: String },
  scannerPhone: { type: String },
  isRead: { type: Boolean, default: false },
  metadata: { type: Object }
}, { timestamps: true });

export default mongoose.model('Notification', notificationSchema);
