import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function fixOrders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/qr_vehicle_safety');
    const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
    const QRCode = mongoose.model('QRCode', new mongoose.Schema({}, { strict: false }));

    const orders = await Order.find().lean();
    console.log('Current Orders in DB:', orders.map(o => ({
      orderNumber: o.orderNumber,
      productName: o.productName,
      productType: o.productType,
      isClaimed: o.isClaimed,
      claimedProductId: o.claimedProductId
    })));

    for (const ord of orders) {
      if (ord.productType === 'PHYSICAL' && ord.isClaimed && ord.claimedProductId) {
        const qrDoc = await QRCode.findOne({ productId: ord.claimedProductId });
        if (qrDoc && (qrDoc.qrType === 'DIGITAL' || qrDoc.batchId === 'STORE-DIGITAL')) {
          console.log('Resetting wrongly claimed physical order:', ord.orderNumber);
          await Order.updateOne(
            { _id: ord._id },
            { $set: { isClaimed: false, claimedAt: null, claimedProductId: null, allocatedQRIds: [] } }
          );
        }
      }
      if (ord.productType === 'DIGITAL' && ord.claimedProductId) {
        const qrDoc = await QRCode.findOne({ productId: ord.claimedProductId });
        if (qrDoc && qrDoc.status === 'ACTIVE') {
          console.log('Setting digital order to registered/active:', ord.orderNumber);
          await Order.updateOne(
            { _id: ord._id },
            { $set: { isClaimed: true, claimedAt: qrDoc.activationDate || new Date() } }
          );
        }
      }
    }

    const updated = await Order.find().lean();
    console.log('\nUpdated Orders in DB:', updated.map(o => ({
      orderNumber: o.orderNumber,
      productName: o.productName,
      productType: o.productType,
      isClaimed: o.isClaimed,
      claimedProductId: o.claimedProductId
    })));

    console.log('\n✅ Orders database state repaired successfully!');
  } catch (err) {
    console.error('Error fixing orders:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

fixOrders();
