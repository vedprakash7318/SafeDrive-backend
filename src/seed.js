import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import connectDB from './config/db.js';
import User from './models/User.js';

dotenv.config();

const seedAdminOnly = async () => {
  await connectDB();
  console.log('🌱 Creating Super Admin...');

  try {
    const adminPhone = process.env.ADMIN_PHONE || '9999999999';
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@safedrive.com').toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    let admin = await User.findOne({ $or: [{ phone: adminPhone }, { role: 'SUPER_ADMIN' }] });
    if (!admin) {
      admin = await User.create({
        name: 'Super Admin',
        phone: adminPhone,
        email: adminEmail,
        whatsappNumber: adminPhone,
        address: 'Safe Drive Corporate HQ',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        password: hashedPassword
      });
      console.log('✅ Super Admin account created successfully!');
    } else {
      admin.name = 'Super Admin';
      admin.phone = adminPhone;
      admin.email = adminEmail;
      admin.password = hashedPassword;
      admin.role = 'SUPER_ADMIN';
      admin.status = 'ACTIVE';
      await admin.save();
      console.log('✅ Super Admin account credentials updated successfully!');
    }

    console.log('----------------------------------------------------');
    console.log('🔑 SUPER ADMIN LOGIN CREDENTIALS:');
    console.log(`Phone:    ${adminPhone}`);
    console.log(`Email:    ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('❌ Error creating admin:', error);
  } finally {
    process.exit(0);
  }
};

seedAdminOnly();
