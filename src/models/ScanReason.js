import mongoose from 'mongoose';

const scanReasonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  iconKey: { type: String, default: 'alert' }, // ban, unlock, car, alert, other
  color: { type: String, default: 'indigo' }, // red, green, blue, rose, purple, amber, indigo
  isOtherType: { type: Boolean, default: false }, // if true, prompts for custom text area
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('ScanReason', scanReasonSchema);
