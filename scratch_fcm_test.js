import mongoose from 'mongoose';
import dotenv from 'dotenv';
import https from 'https';

async function getRealTime() {
  return new Promise((resolve, reject) => {
    https.get('https://worldtimeapi.org/api/timezone/Etc/UTC', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.unixtime * 1000);
        } catch (e) {
          resolve(Date.now());
        }
      });
    }).on('error', () => resolve(Date.now()));
  });
}

async function run() {
  console.log('Original Date.now():', new Date(Date.now()).toISOString());
  const realTime = await getRealTime();
  console.log('Real Time from API:', new Date(realTime).toISOString());
  
  // Patch Date.now
  const originalNow = Date.now;
  Date.now = () => {
    // Return realTime + elapsed time since we fetched it
    return realTime; 
  };
  
  // Also patch new Date() if needed, but google-auth-library usually uses Date.now() or Math.floor(Date.now() / 1000)
  
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  dotenv.config();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const serviceAccountPath = path.join(__dirname, 'firebase-admin.json');

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccountPath),
    });
  }

  const userSchema = new mongoose.Schema({}, { strict: false });
  const User = mongoose.model('User', userSchema);

  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ phone: '9341283363' }).lean(); // Mayank
  
  if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
    console.log('No FCM tokens for this user');
    process.exit();
  }
  
  const tokens = user.fcmTokens;
  console.log('Sending to tokens:', tokens);
  
  const message = {
    notification: {
      title: 'SafeDrive Alert',
      body: 'Testing Firebase Notification!',
    },
    data: { reason: 'test', click_action: '/dashboard' },
    tokens: tokens,
  };
  
  try {
    const response = await getMessaging().sendEachForMulticast(message);
    console.log(`FCM Sent. Success: ${response.successCount}, Failed: ${response.failureCount}`);
    
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Error for token ${tokens[idx]}:`, resp.error);
        }
      });
    }
  } catch (err) {
    console.error('Failed to send FCM:', err);
  }
  
  process.exit();
}

run();
