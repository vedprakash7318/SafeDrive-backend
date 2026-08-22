import dotenv from 'dotenv';
dotenv.config();
import connectDB from './src/config/db.js';
import User from './src/models/User.js';
import QRCode from './src/models/QRCode.js';
import Payment from './src/models/Payment.js';

async function check() {
  await connectDB();
  const users = await User.find();
  console.log('--- ALL USERS ---');
  console.log(users.map(u => ({ id: u._id, name: u.name, phone: u.phone, email: u.email })));

  const payments = await Payment.find().sort({ createdAt: -1 }).limit(5);
  console.log('--- LATEST PAYMENTS ---');
  console.log(payments);

  const qrs = await QRCode.find({ userId: { $exists: true, $ne: null } });
  console.log('--- USER ALLOCATED QRS ---');
  console.log(qrs.map(q => ({ code: q.copyCode, status: q.status, userId: q.userId })));

  process.exit(0);
}

check().catch(console.error);
