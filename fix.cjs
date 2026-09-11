const mongoose = require('mongoose'); 
mongoose.connect('mongodb+srv://vedprakashvp0123_db_user:umU8kkt23Cmya8iJ@cluster0.rsz12x8.mongodb.net/safe-drive?appName=Cluster0').then(async () => { 
  const db = mongoose.connection.db; 
  const res = await db.collection('qrcodes').updateMany({ batchId: 'LUGGAGE' }, { $set: { qrFor: 'Luggage' } }); 
  console.log(res); 
  mongoose.disconnect(); 
});
