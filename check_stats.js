import('dotenv/config').then(() => import('./src/config/db.js')).then(async (dbModule) => {
  await dbModule.default(); // connects to DB
  const mongoose = (await import('mongoose')).default;
  const QRCode = mongoose.model('QRCode', new mongoose.Schema({ status: String, batchId: String }, { strict: false }));
  
  const stats = await QRCode.aggregate([
    { $match: { batchId: 'DX' } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  console.log('DX Batch Stats:', stats);
  process.exit(0);
});
