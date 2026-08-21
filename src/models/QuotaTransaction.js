import mongoose from 'mongoose';

const quotaTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qrId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRCode', required: true },
  type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
  category: { type: String, enum: ['CALL', 'MESSAGE'], required: true },
  quantity: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  reason: { type: String, required: true } 
}, { timestamps: true });

export default mongoose.model('QuotaTransaction', quotaTransactionSchema);
