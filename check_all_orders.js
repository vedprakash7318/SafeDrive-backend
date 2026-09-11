import('dotenv/config').then(() => import('./src/config/db.js')).then(async (dbModule) => {
  await dbModule.default(); // connects to DB
  const mongoose = (await import('mongoose')).default;
  const PartnerOrder = mongoose.model('PartnerOrder', new mongoose.Schema({ orderStatus: String, assignedTagIds: [mongoose.Schema.Types.ObjectId] }, { strict: false }));
  const QRCode = mongoose.model('QRCode', new mongoose.Schema({ status: String, batchId: String }, { strict: false }));
  
  const dispatchedOrders = await PartnerOrder.find();
  
  for (const order of dispatchedOrders) {
    if (order.assignedTagIds && order.assignedTagIds.length > 0) {
      const tags = await QRCode.find({ _id: { $in: order.assignedTagIds } });
      const batchCounts = {};
      tags.forEach(t => {
        batchCounts[t.batchId] = (batchCounts[t.batchId] || 0) + 1;
      });
      console.log('Order', order._id, 'Status:', order.orderStatus, 'Batches:', batchCounts);
    }
  }
  process.exit(0);
});
