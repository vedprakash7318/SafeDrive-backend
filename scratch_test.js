import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const orderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model('Order', orderSchema);
const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

async function testDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  const cleanPhone = '6389275065';
  const phonePattern = cleanPhone.length >= 8 ? cleanPhone.slice(-8) : cleanPhone;
  
  const allOrdersForPhone = await Order.find({
    $and: [
      {
        $or: [
          { customerPhone: cleanPhone },
          { customerPhone: { $regex: phonePattern } },
          { activationPhone: cleanPhone },
          { activationPhone: { $regex: phonePattern } },
          { activationPhones: cleanPhone },
          { activationPhones: { $regex: phonePattern } }
        ]
      },
      { deliveryStatus: { $nin: ['CANCELLED', 'RETURNED'] } }
    ]
  }).sort({ createdAt: -1 }).lean();
  
  console.log('Orders found:', allOrdersForPhone.map(o => o.customerName));
  
  const existingUser = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+91${cleanPhone}` },
        { phone: `91${cleanPhone}` }
      ]
    }).lean();
    
  console.log('User found:', existingUser?.name);
  process.exit();
}
testDB();
