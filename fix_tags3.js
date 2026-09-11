import('dotenv/config').then(() => import('./src/config/db.js')).then(async (dbModule) => {
  await dbModule.default(); // connects to DB
  const mongoose = (await import('mongoose')).default;
  const PartnerOrder = mongoose.model('PartnerOrder', new mongoose.Schema({ orderStatus: String, assignedTagIds: [mongoose.Schema.Types.ObjectId] }, { strict: false }));
  const QRCode = mongoose.model('QRCode', new mongoose.Schema({ status: String }, { strict: false }));
  
  const dispatchedOrders = await PartnerOrder.find({ orderStatus: { $in: ['DISPATCHED', 'SHIPPED'] } });
  let updatedCount = 0;
  for (const order of dispatchedOrders) {
    if (order.assignedTagIds && order.assignedTagIds.length > 0) {
      const result = await QRCode.updateMany(
        { _id: { $in: order.assignedTagIds }, status: 'IN STOCK' },
        { $set: { status: 'SOLD' } }
      );
      updatedCount += result.modifiedCount;
    }
  }
  console.log('Retroactively updated ' + updatedCount + ' tags to SOLD.');
  process.exit(0);
});
