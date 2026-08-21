import mongoose from 'mongoose';

const emergencyAlertSchema = new mongoose.Schema({
  qrId: { type: mongoose.Schema.Types.ObjectId, ref: 'QRCode' },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  publicToken: { type: String, required: true },
  vehicleNumber: { type: String },
  ownerName: { type: String },
  alertStatus: { type: String, enum: ['TRIGGERED', 'ACKNOWLEDGED', 'RESOLVED'], default: 'TRIGGERED' },
  ip: { type: String },
  device: { type: String },
  location: {
    latitude: Number,
    longitude: Number,
    mapsLink: String
  },
  notifiedContacts: [{ name: String, number: String }]
}, { timestamps: true });

export default mongoose.model('EmergencyAlert', emergencyAlertSchema);
