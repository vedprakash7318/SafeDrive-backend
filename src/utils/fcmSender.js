import axios from 'axios';
import User from '../models/User.js';

/**
 * Dispatch Push Notification to all active registered devices of a user
 * Supports multi-device delivery (Phone, PC, Tablet)
 */
export const sendFCMNotificationToUser = async (userId, payload) => {
  try {
    if (!userId) return;
    const user = await User.findById(userId);
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      return;
    }

    const { title, body, data = {} } = payload;
    const tokens = [...new Set(user.fcmTokens.filter(t => typeof t === 'string' && t.length > 20))];

    // If server key or credentials are configured in .env, dispatch via FCM REST
    const fcmServerKey = process.env.FIREBASE_SERVER_KEY || process.env.FCM_SERVER_KEY;

    if (fcmServerKey && tokens.length > 0) {
      for (const token of tokens) {
        try {
          await axios.post(
            'https://fcm.googleapis.com/fcm/send',
            {
              to: token,
              notification: {
                title,
                body,
                icon: '/favicon.svg',
                sound: 'default'
              },
              data: {
                ...data,
                click_action: '/dashboard',
                sound: '/ring1.mp3'
              },
              priority: 'high'
            },
            {
              headers: {
                'Authorization': `key=${fcmServerKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 5000
            }
          );
        } catch (err) {
          console.warn(`FCM send error for token ${token.slice(0, 10)}...:`, err.response?.data || err.message);
          // If token is expired or unregistered, remove it
          if (err.response?.status === 400 || err.response?.data?.results?.[0]?.error === 'NotRegistered') {
            await User.updateOne({ _id: userId }, { $pull: { fcmTokens: token } });
          }
        }
      }
    }
  } catch (error) {
    console.error('sendFCMNotificationToUser error:', error);
  }
};
