import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qrId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRCode', required: true },
  startDate: { type: Date, default: Date.now },
  expiryDate: {
    type: Date,
    default: function() {
      return this.endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }
  },
  endDate: { type: Date },
  status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'SUSPENDED'], default: 'ACTIVE' },
  renewalAmount: {
    type: Number,
    default: function() {
      return this.price !== undefined ? this.price : 199;
    }
  },
  price: { type: Number },
  paymentId: { type: String }
}, { timestamps: true });

export default mongoose.model('Subscription', subscriptionSchema);
