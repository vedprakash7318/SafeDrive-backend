import mongoose from 'mongoose';

const partnerOrderSchema = new mongoose.Schema({
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Product info from the selected package
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerProduct', required: true },
  productName: { type: String, required: true },
  category: { type: String },
  assignedTagIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QRCode' }],
  
  // Package details
  quantity: { type: Number, required: true, min: 1 },
  totalAmount: { type: Number, required: true }, // price for the quantity
  deliveryCharge: { type: Number, required: true },
  grandTotal: { type: Number, required: true },
  
  // Customer / Shipping Details
  partnerName: { type: String, required: true },
  partnerPhone: { type: String, required: true },
  alternatePhone: { type: String },
  partnerEmail: { type: String },
  deliveryAddress: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  landmark: { type: String },

  // Payment Details
  paymentMethod: { type: String, enum: ['ONLINE', 'COD'], required: true },
  paymentStatus: { type: String, enum: ['PAID', 'PENDING', 'FAILED'], default: 'PENDING' },
  razorpayPaymentId: { type: String },
  razorpayOrderId: { type: String },
  
  // Order Status & Shipping Tracking
  orderStatus: { 
    type: String, 
    enum: ['PENDING', 'PROCESSING', 'DISPATCHED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'], 
    default: 'PENDING' 
  },
  orderNumber: { type: String, required: true, unique: true },
  
  // Shipping info
  courierPartner: { type: String, default: '' },
  trackingNumber: { type: String, default: '' },
  trackingLink: { type: String, default: '' },
  shippingLabelUrl: { type: String, default: '' },
  dispatchDate: { type: Date },
  deliveryDate: { type: Date },
  adminNotes: { type: String, default: '' },

}, { timestamps: true });

export default mongoose.model('PartnerOrder', partnerOrderSchema);
