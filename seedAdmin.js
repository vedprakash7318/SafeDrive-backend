import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import User from './src/models/User.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/safe-drive';

const seedAdmin = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const email = 'admin@safedrive.com';
    const plainPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const existingAdmin = await User.findOne({ email });

    if (existingAdmin) {
      existingAdmin.password = hashedPassword;
      existingAdmin.role = 'ADMIN';
      existingAdmin.status = 'ACTIVE';
      await existingAdmin.save();
      console.log('Existing admin updated with new password and ADMIN role.');
    } else {
      await User.create({
        name: 'Super Admin',
        phone: '9999999999',
        email: email,
        password: hashedPassword,
        role: 'ADMIN',
        status: 'ACTIVE',
        address: 'HQ'
      });
      console.log('New dummy admin seeded successfully.');
    }
  } catch (error) {
    console.error('Error seeding admin:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

seedAdmin();
