import mongoose from 'mongoose';

const contactInquirySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    subject: { type: String, trim: true, default: 'General Inquiry' },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['UNREAD', 'READ', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'NEW'],
      default: 'UNREAD'
    },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    replyNotes: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' }
  },
  { timestamps: true }
);

export default mongoose.model('ContactInquiry', contactInquirySchema);
