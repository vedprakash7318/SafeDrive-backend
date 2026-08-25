import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true },
  productType: { type: String, enum: ['PHYSICAL', 'DIGITAL'], default: 'PHYSICAL' },
  qrFor: { type: String, default: 'Car', trim: true },
  activationPhone: { type: String, trim: true }, // Mobile number designated to verify & activate this kit (Kit #1)
  activationPhones: [{ type: String, trim: true }], // Array of mobile numbers for each unit/quantity
  claimedCount: { type: Number, default: 0 }, // Number of units claimed so far
  claimedActivationPhones: [{ type: String, trim: true }], // Phone numbers that have claimed their kit slot
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true, lowercase: true, trim: true },
  customerPhone: { type: String, required: true, trim: true },
  customerGender: { type: String, default: 'Male', trim: true },
  gender: { type: String, default: 'Male', trim: true },
  deliveryAddress: { type: String },
  city: { type: String },
  state: { type: String },
  pincode: { type: String },
  landmark: { type: String },
  amount: { type: Number, required: true },
  quantity: { type: Number, default: 1, min: 1 },
  unitPrice: { type: Number },
  paymentStatus: { type: String, enum: ['PAID', 'PENDING', 'FAILED'], default: 'PAID' },
  deliveryStatus: { type: String, enum: ['PROCESSING', 'DISPATCHED', 'SHIPPED', 'DELIVERED', 'CANCELLED'], default: 'PROCESSING' },
  courierPartner: { type: String, default: '' },
  trackingNumber: { type: String, default: '' },
  adminNotes: { type: String, default: '' },
  dispatchDate: { type: Date },
  deliveryDate: { type: Date },
  orderNumber: { type: String, required: true, unique: true },
  razorpayPaymentId: { type: String },
  razorpayOrderId: { type: String },
  isClaimed: { type: Boolean, default: false },
  claimedAt: { type: Date },
  claimedProductId: { type: String }, // e.g. "SD005"
  allocatedQRIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QRCode' }],
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

export default mongoose.model('Order', orderSchema);
