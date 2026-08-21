import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import connectDB from './config/db.js';
import User from './models/User.js';
import Vehicle from './models/Vehicle.js';
import QRCode from './models/QRCode.js';
import QuotaWallet from './models/QuotaWallet.js';
import QuotaTransaction from './models/QuotaTransaction.js';
import Subscription from './models/Subscription.js';
import QuotaPackage from './models/QuotaPackage.js';
import Payment from './models/Payment.js';
import EmergencyAlert from './models/EmergencyAlert.js';

dotenv.config();

const seedData = async () => {
  await connectDB();
  console.log('🌱 Starting comprehensive data seed...');

  try {
    // Clear existing
    await User.deleteMany({});
    await Vehicle.deleteMany({});
    await QRCode.deleteMany({});
    await QuotaWallet.deleteMany({});
    await QuotaTransaction.deleteMany({});
    await Subscription.deleteMany({});
    await QuotaPackage.deleteMany({});
    await Payment.deleteMany({});
    await EmergencyAlert.deleteMany({});

    // 1. Create Super Admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await User.create({
      name: 'Super Admin',
      phone: '9999999999',
      whatsappNumber: '9999999999',
      address: 'Safe Drive Corporate HQ, New Delhi',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      password: hashedPassword
    });

    // 2. Create Regular User
    const userPassword = await bcrypt.hash('user123', 10);
    const user = await User.create({
      name: 'Ved Prakash',
      phone: '8888888888',
      whatsappNumber: '8888888888',
      address: 'Hazratganj, Lucknow, UP',
      role: 'USER',
      status: 'ACTIVE',
      password: userPassword
    });

    // 3. Create Vehicle for User
    const vehicle = await Vehicle.create({
      userId: user._id,
      vehicleName: 'Creta SX(O)',
      vehicleBrand: 'Hyundai',
      vehicleNumber: 'UP32AB1234',
      status: 'ACTIVE',
      emergencyContacts: [
        { name: 'Rahul Sharma (Brother)', number: '9876543210' },
        { name: 'Amit Verma (Friend)', number: '9123456780' }
      ]
    });

    // 4. Create Active QR Set (SD001C1 and SD001C2)
    const now = new Date();
    const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const activeQR1 = await QRCode.create({
      productId: 'SD001',
      batchId: 'BATCH-AUG-2026',
      copyCode: 'SD001C1',
      publicToken: 'test_token_8f91a',
      userId: user._id,
      vehicleId: vehicle._id,
      status: 'ACTIVE',
      activationDate: now,
      expiryDate: oneYearLater
    });

    const activeQR2 = await QRCode.create({
      productId: 'SD001',
      batchId: 'BATCH-AUG-2026',
      copyCode: 'SD001C2',
      publicToken: 'test_token_8f91b',
      userId: user._id,
      vehicleId: vehicle._id,
      status: 'ACTIVE',
      activationDate: now,
      expiryDate: oneYearLater
    });

    // 5. Create Subscription for SD001
    await Subscription.create({
      userId: user._id,
      qrId: activeQR1._id,
      startDate: now,
      expiryDate: oneYearLater,
      status: 'ACTIVE',
      renewalAmount: 199
    });

    // 6. Create Quota Wallet for Active QR
    await QuotaWallet.create({
      userId: user._id,
      qrId: activeQR1._id,
      callBalance: 10,
      messageBalance: 20,
      totalCallsPurchased: 10,
      totalCallsUsed: 0,
      totalMessagesPurchased: 20,
      totalMessagesUsed: 0
    });

    await QuotaTransaction.create({
      userId: user._id,
      qrId: activeQR1._id,
      type: 'CREDIT',
      category: 'CALL',
      quantity: 10,
      balanceAfter: 10,
      reason: 'Initial QR Activation Quota'
    });

    await QuotaTransaction.create({
      userId: user._id,
      qrId: activeQR1._id,
      type: 'CREDIT',
      category: 'MESSAGE',
      quantity: 20,
      balanceAfter: 20,
      reason: 'Initial QR Activation Quota'
    });

    // 7. Create Unregistered QR (SD002C1) - State 1
    await QRCode.create({
      productId: 'SD002',
      batchId: 'BATCH-AUG-2026',
      copyCode: 'SD002C1',
      publicToken: 'test_token_unreg123',
      status: 'IN STOCK'
    });
    await QRCode.create({
      productId: 'SD002',
      batchId: 'BATCH-AUG-2026',
      copyCode: 'SD002C2',
      publicToken: 'test_token_unreg124',
      status: 'IN STOCK'
    });

    // 8. Create Expired QR (SD003C1) - State 3
    const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    await QRCode.create({
      productId: 'SD003',
      batchId: 'BATCH-AUG-2026',
      copyCode: 'SD003C1',
      publicToken: 'test_token_expired999',
      userId: user._id,
      vehicleId: vehicle._id,
      status: 'EXPIRED',
      activationDate: new Date(pastDate.getTime() - 365 * 24 * 60 * 60 * 1000),
      expiryDate: pastDate
    });

    // 9. Create Suspended QR (SD004C1) - State 4
    await QRCode.create({
      productId: 'SD004',
      batchId: 'BATCH-AUG-2026',
      copyCode: 'SD004C1',
      publicToken: 'test_token_suspended555',
      status: 'SUSPENDED'
    });

    // 10. Seed Quota Packages
    await QuotaPackage.insertMany([
      { name: '10 Calls Booster', category: 'CALL', quantity: 10, price: 49, status: 'ACTIVE' },
      { name: '25 Calls Booster', category: 'CALL', quantity: 25, price: 99, status: 'ACTIVE' },
      { name: '50 Calls Booster', category: 'CALL', quantity: 50, price: 179, status: 'ACTIVE' },
      { name: '20 Messages Booster', category: 'MESSAGE', quantity: 20, price: 29, status: 'ACTIVE' },
      { name: '50 Messages Booster', category: 'MESSAGE', quantity: 50, price: 69, status: 'ACTIVE' },
      { name: '1-Year QR Renewal', category: 'RENEWAL', quantity: 365, price: 199, bonusCalls: 10, bonusMessages: 20, status: 'ACTIVE' }
    ]);

    // 11. Seed Payments
    await Payment.create({
      userId: user._id,
      orderId: 'ORD_INIT_101',
      paymentId: 'PAY_101_SUCCESS',
      amount: 499,
      purpose: 'QR_PURCHASE',
      status: 'SUCCESSFUL'
    });

    // 12. Seed Emergency Alert for Demo
    await EmergencyAlert.create({
      qrId: activeQR1._id,
      vehicleId: vehicle._id,
      userId: user._id,
      publicToken: 'test_token_8f91a',
      vehicleNumber: 'UP32AB1234',
      ownerName: 'Ved Prakash',
      ip: '127.0.0.1',
      device: 'Chrome Mobile / Android',
      notifiedContacts: vehicle.emergencyContacts,
      alertStatus: 'TRIGGERED'
    });

    console.log('✅ Test data successfully seeded!');
    console.log('----------------------------------------------------');
    console.log('📱 PUBLIC SCAN TEST LINKS:');
    console.log('1. Active QR (State 2):       http://localhost:5174/q/test_token_8f91a');
    console.log('2. Unregistered QR (State 1): http://localhost:5174/q/test_token_unreg123');
    console.log('3. Expired QR (State 3):      http://localhost:5174/q/test_token_expired999');
    console.log('4. Suspended QR (State 4):    http://localhost:5174/q/test_token_suspended555');
    console.log('----------------------------------------------------');
    console.log('🔑 CREDENTIALS:');
    console.log('Admin: Phone 9999999999 | Password: admin123');
    console.log('User:  Phone 8888888888 | Password: user123');
    console.log('----------------------------------------------------');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

seedData();
