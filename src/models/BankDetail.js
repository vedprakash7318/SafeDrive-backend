import mongoose from 'mongoose';

const bankDetailSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  accountHolderName: { type: String, trim: true },
  accountNumber: { type: String, trim: true },
  ifscCode: { type: String, trim: true },
  bankName: { type: String, trim: true },
  upiId: { type: String, trim: true }
}, { timestamps: true });

export default mongoose.model('BankDetail', bankDetailSchema);
