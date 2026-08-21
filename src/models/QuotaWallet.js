import mongoose from 'mongoose';

const quotaWalletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qrId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRCode', required: true },
  callBalance: { type: Number, default: 0 },
  messageBalance: { type: Number, default: 0 },
  totalCallsPurchased: { type: Number, default: 0 },
  totalCallsUsed: { type: Number, default: 0 },
  totalMessagesPurchased: { type: Number, default: 0 },
  totalMessagesUsed: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('QuotaWallet', quotaWalletSchema);
