import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isVehicle: { type: Boolean, default: true },
  itemName: { type: String },
  itemType: { type: String },
  vehicleName: { type: String, required: true },
  vehicleBrand: { type: String, required: true },
  vehicleModel: { type: String },
  vehicleNumber: { type: String, required: true },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  emergencyContacts: [{
    name: { type: String, required: true },
    number: { type: String, required: true }
  }]
}, { timestamps: true });

export default mongoose.model('Vehicle', vehicleSchema);
