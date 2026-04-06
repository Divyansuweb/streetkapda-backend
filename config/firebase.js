const admin = require('firebase-admin');

// Use the service account JSON file directly
const serviceAccount = require('./firebase-service-account.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const sendFCMNotification = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) return null;
  
  try {
    const message = {
      token: fcmToken,
      notification: {
        title: title,
        body: body,
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'street_kapda_channel',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };
    
    const response = await admin.messaging().send(message);
    console.log('FCM sent successfully to:', fcmToken.substring(0, 20) + '...');
    return response;
  } catch (error) {
    console.error('FCM send error:', error.message);
    // If token is invalid, we should delete it from DB
    if (error.code === 'messaging/registration-token-not-registered') {
      return { invalidToken: true };
    }
    return null;
  }
};

const sendFCMToMultiple = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) return;
  
  // Firebase can send max 500 messages at once
  const chunkSize = 500;
  const chunks = [];
  for (let i = 0; i < tokens.length; i += chunkSize) {
    chunks.push(tokens.slice(i, i + chunkSize));
  }
  
  let successCount = 0;
  let failCount = 0;
  
  for (const chunk of chunks) {
    const messages = chunk.map(token => ({
      token: token,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
    }));
    
    try {
      const response = await admin.messaging().sendEach(messages);
      successCount += response.successCount;
      failCount += response.failureCount;
      console.log(`FCM batch: ${response.successCount} success, ${response.failureCount} failures`);
    } catch (error) {
      console.error('FCM batch send error:', error.message);
      failCount += chunk.length;
    }
  }
  
  return { successCount, failCount };
};

module.exports = { sendFCMNotification, sendFCMToMultiple };