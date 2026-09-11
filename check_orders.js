import('dotenv/config').then(() => import('./src/config/db.js')).then(async (dbModule) => {
  await dbModule.default(); // connects to DB
  const mongoose = (await import('mongoose')).default;
  const PartnerOrder = mongoose.model('PartnerOrder', new mongoose.Schema({ orderStatus: String, assignedTagIds: [mongoose.Schema.Types.ObjectId], partnerName: String }, { strict: false }));
  const orders = await PartnerOrder.find({ orderStatus: { $in: ['DISPATCHED', 'SHIPPED', 'DELIVERED'] } }).sort({ _id: -1 }).limit(5);
  console.log(orders.map(o => ({ id: o._id, name: o.partnerName, status: o.orderStatus, tags: o.assignedTagIds ? o.assignedTagIds.length : 0 })));
  process.exit(0);
});
