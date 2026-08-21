import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: String, required: true },
  paymentId: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  purpose: { type: String, enum: ['QR_PURCHASE', 'RENEWAL', 'CALL_PACKAGE', 'MESSAGE_PACKAGE'], required: true },
  status: { type: String, enum: ['INITIATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'], default: 'INITIATED' },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

export default mongoose.model('Payment', paymentSchema);
