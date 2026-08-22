import dotenv from 'dotenv';
import crypto from 'crypto';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import QRCode from '../models/QRCode.js';
import Order from '../models/Order.js';

dotenv.config();

const restore = async () => {
  await connectDB();
  const user = await User.findOne({ phone: '89898989898' });
  if (user) {
    const existing = await QRCode.find({ productId: 'SD021' });
    if (existing.length === 0) {
      const qrs = [
        {
          productId: 'SD021',
          batchId: 'STORE-DIGITAL',
          copyCode: 'SD021C1',
          publicToken: '0ffa8067ff18cc8980c7ae33ad756f53',
          status: 'GENERATED',
          userId: user._id,
          qrFor: 'Car',
          qrType: 'DIGITAL',
          initialCalls: 10,
          initialMessages: 20,
          validityDays: 365,
          renewalAmount: 199
        },
        {
          productId: 'SD021',
          batchId: 'STORE-DIGITAL',
          copyCode: 'SD021C2',
          publicToken: crypto.randomBytes(16).toString('hex'),
          status: 'GENERATED',
          userId: user._id,
          qrFor: 'Car',
          qrType: 'DIGITAL',
          initialCalls: 10,
          initialMessages: 20,
          validityDays: 365,
          renewalAmount: 199
        }
      ];
      const created = await QRCode.insertMany(qrs);
      console.log('Restored SD021 QRs for Chandrama:', created.length);
      await Order.updateOne(
        { orderNumber: 'ORD-1787406146598-154' },
        { $set: { allocatedQRIds: created.map(q => q._id), isClaimed: true, claimedProductId: 'SD021' } }
      );
    }
  }
  console.log('✅ Done restoring SD021!');
  process.exit(0);
};

restore();
