import dotenv from 'dotenv';
dotenv.config();

import connectDB from './src/config/db.js';
import User from './src/models/User.js';
import Vehicle from './src/models/Vehicle.js';
import QRCode from './src/models/QRCode.js';
import bcrypt from 'bcrypt';

async function main() {
  await connectDB();

  // 1. Ensure Super Admin account exists with known password
  const hashed = await bcrypt.hash('admin123', 10);
  let admin = await User.findOne({ email: 'admin@safedrive.com' });
  if (!admin) {
    admin = await User.create({
      name: 'SafeDrive Super Admin',
      email: 'admin@safedrive.com',
      phone: '9999999999',
      password: hashed,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE'
    });
    console.log('✅ Created Super Admin: admin@safedrive.com / admin123');
  } else {
    admin.password = hashed;
    admin.role = 'SUPER_ADMIN';
    admin.status = 'ACTIVE';
    await admin.save();
    console.log('✅ Updated Super Admin: admin@safedrive.com / admin123');
  }

  // 2. Ensure test customer exists
  let customer = await User.findOne({ phone: '9695078159' });
  if (customer) {
    customer.password = hashed;
    await customer.save();
    console.log('✅ Customer 9695078159 password synced: admin123');
  }

  // 3. Find sample active QR
  const sampleActiveQR = await QRCode.findOne({ status: 'ACTIVE' }).populate('vehicleId');
  console.log('✅ Active QR in DB:', sampleActiveQR ? {
    productId: sampleActiveQR.productId,
    publicToken: sampleActiveQR.publicToken,
    vehicleNumber: sampleActiveQR.vehicleId?.vehicleNumber
  } : 'None');

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
