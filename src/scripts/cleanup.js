import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import QRCode from '../models/QRCode.js';
import QuotaWallet from '../models/QuotaWallet.js';

dotenv.config();

const run = async () => {
  await connectDB();
  console.log('🔍 Checking database for orphaned Active QRs with no vehicle...');

  // 1. Delete all test STORE-DIGITAL and STORE-PHYSICAL records that were auto-created without any vehicle
  const delRes = await QRCode.deleteMany({
    batchId: { $in: ['STORE-DIGITAL', 'STORE-PHYSICAL'] },
    vehicleId: { $in: [null, undefined] }
  });
  console.log('🗑️ Deleted unlinked store test QRs:', delRes.deletedCount);

  // 2. For any real inventory QRs that have status ACTIVE but vehicleId is null, reset them to GENERATED
  const resetRes = await QRCode.updateMany(
    { status: 'ACTIVE', vehicleId: { $in: [null, undefined] } },
    { $set: { status: 'GENERATED', userId: null, activationDate: null } }
  );
  console.log('🔄 Reset orphaned Active QRs to GENERATED:', resetRes.modifiedCount);

  console.log('✅ Database cleanup completed!');
  process.exit(0);
};

run().catch((err) => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
