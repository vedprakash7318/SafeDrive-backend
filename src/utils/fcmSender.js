import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin SDK
try {
  if (!getApps().length) {
    // Look for firebase-admin.json at the backend root
    const serviceAccountPath = path.join(__dirname, '..', '..', 'firebase-admin.json');
    initializeApp({
      credential: cert(serviceAccountPath),
    });
    console.log('Firebase Admin SDK initialized successfully for FCM v1.');
  }
} catch (error) {
  console.warn('Firebase Admin SDK failed to initialize. Push notifications may not work:', error.message);
}

/**
 * Dispatch Push Notification to all active registered devices of a user
 * Supports multi-device delivery (Phone, PC, Tablet) via FCM HTTP v1 API
 */
export const sendFCMNotificationToUser = async (userId, payload) => {
  try {
    if (!userId || !getApps().length) return;
    
    const user = await User.findById(userId);
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      return;
    }

    const { title, body, data = {} } = payload;
    const tokens = [...new Set(user.fcmTokens.filter(t => typeof t === 'string' && t.length > 20))];

    if (tokens.length > 0) {
      // Ensure all values in data object are strings (FCM requirement)
      const stringifiedData = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined) {
          stringifiedData[key] = String(value);
        }
      }

      // Add default click action to data payload
      stringifiedData.click_action = '/dashboard';

      const message = {
        notification: {
          title,
          body,
        },
        data: stringifiedData,
        tokens: tokens,
      };

      try {
        const response = await getMessaging().sendEachForMulticast(message);
        console.log(`FCM Sent. Success: ${response.successCount}, Failed: ${response.failureCount}`);
        
        // Remove invalid tokens if any failures occurred
        if (response.failureCount > 0) {
          const failedTokens = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errorCode = resp.error?.code;
              console.warn(`FCM send error for token ${tokens[idx].slice(0, 10)}...:`, errorCode);
              if (
                errorCode === 'messaging/invalid-registration-token' ||
                errorCode === 'messaging/registration-token-not-registered'
              ) {
                failedTokens.push(tokens[idx]);
              }
            }
          });
          if (failedTokens.length > 0) {
            await User.updateOne({ _id: userId }, { $pull: { fcmTokens: { $in: failedTokens } } });
          }
        }
      } catch (err) {
        console.error('Failed to send multicast FCM message:', err);
      }
    }
  } catch (error) {
    console.error('sendFCMNotificationToUser error:', error);
  }
};

