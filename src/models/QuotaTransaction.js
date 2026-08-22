import mongoose from 'mongoose';

const quotaTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qrId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRCode', required: true },
  productId: { type: String, index: true },
  type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
  category: { type: String, enum: ['CALL', 'MESSAGE', 'VALIDITY'], required: true },
  quantity: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  source: {
    type: String,
    enum: ['INITIAL_FREE', 'ADMIN_GRANT', 'PURCHASE_ADDON', 'SCAN_USAGE', 'ADMIN_ADJUSTMENT', 'RENEWAL'],
    default: 'ADMIN_GRANT'
  },
  amountPaid: { type: Number, default: 0 },
  paymentId: { type: String },
  orderId: { type: String },
  packageName: { type: String },
  performedBy: { type: String, default: 'System' },
  reason: { type: String, required: true },
  notes: { type: String }
}, { timestamps: true });

export default mongoose.model('QuotaTransaction', quotaTransactionSchema);
