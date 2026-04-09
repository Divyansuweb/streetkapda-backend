
const admin = require('firebase-admin');
const { logger } = require('../utils/logger');

// Initialize Firebase Admin SDK only for notifications
let firebaseApp = null;

const initFirebase = () => {
  try {
    // Check if already initialized
    if (firebaseApp) {
      return firebaseApp;
    }

    // Try to get credentials from environment variables
    let serviceAccount = null;
    
    // // Method 1: Check for individual env variables (recommended for production)
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_CLIENT_EMAIL && 
        process.env.FIREBASE_PRIVATE_KEY) {
      
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };
      logger.info('Firebase initialized from environment variables');
    }

    // In your firebase.js, update the private key handling:
// if (process.env.FIREBASE_PROJECT_ID && 
//     process.env.FIREBASE_CLIENT_EMAIL && 
//     process.env.FIREBASE_PRIVATE_KEY) {
  
//   // Handle private key properly for Render
//   let privateKey = process.env.FIREBASE_PRIVATE_KEY;
//   // If the key contains literal \n, replace them with actual newlines
//   if (privateKey.includes('\\n')) {
//     privateKey = privateKey.replace(/\\n/g, '\n');
//   }
  
//   serviceAccount = {
//     projectId: process.env.FIREBASE_PROJECT_ID,
//     clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//     privateKey: privateKey,
//   };
// }
    // Method 2: Check for JSON string in env variable
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        logger.info('Firebase initialized from JSON string');
      } catch (e) {
        logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
      }
    }
    // Method 3: Check for service account file (development only)
    else if (process.env.NODE_ENV !== 'production') {
      try {
        // Try to load from file (only in development)
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '../firebase-service-account.json');
        
        if (fs.existsSync(filePath)) {
          serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          logger.info('Firebase initialized from service account file');
        }
      } catch (e) {
        logger.warn('No service account file found');
      }
    }

    if (!serviceAccount) {
      logger.warn('Firebase credentials not found. Push notifications will be disabled.');
      return null;
    }

    // Initialize Firebase
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    logger.info('✅ Firebase initialized for notifications');
    return firebaseApp;
  } catch (error) {
    logger.error('Firebase initialization error:', error.message);
    return null;
  }
};

const getFirebaseApp = () => {
  if (!firebaseApp) {
    return initFirebase();
  }
  return firebaseApp;
};

const sendFCMNotification = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) return null;
  
  const app = getFirebaseApp();
  if (!app) {
    logger.warn('Firebase not available, skipping push notification');
    return null;
  }
  
  try {
    const message = {
      token: fcmToken,
      notification: {
        title: title.substring(0, 100),
        body: body.substring(0, 200),
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v).substring(0, 1000)])
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
    logger.info(`FCM sent successfully to: ${fcmToken.substring(0, 20)}...`);
    return response;
  } catch (error) {
    logger.error('FCM send error:', error.message);
    if (error.code === 'messaging/registration-token-not-registered') {
      return { invalidToken: true };
    }
    return null;
  }
};

const sendFCMToMultiple = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) return { successCount: 0, failCount: 0 };
  
  const app = getFirebaseApp();
  if (!app) {
    logger.warn('Firebase not available, skipping push notifications');
    return { successCount: 0, failCount: tokens.length };
  }
  
  // Firebase can send max 500 messages at once
  const chunkSize = 500;
  const chunks = [];
  for (let i = 0; i < tokens.length; i += chunkSize) {
    chunks.push(tokens.slice(i, i + chunkSize));
  }
  
  let successCount = 0;
  let failCount = 0;
  const invalidTokens = [];
  
  for (const chunk of chunks) {
    const messages = chunk.map(token => ({
      token: token,
      notification: { 
        title: title.substring(0, 100), 
        body: body.substring(0, 200) 
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v).substring(0, 1000)])
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
      
      // Collect invalid tokens if any
      if (response.responses) {
        response.responses.forEach((resp, idx) => {
          if (resp.error && resp.error.code === 'messaging/registration-token-not-registered') {
            invalidTokens.push(chunk[idx]);
          }
        });
      }
      
      logger.info(`FCM batch: ${response.successCount} success, ${response.failureCount} failures`);
    } catch (error) {
      logger.error('FCM batch send error:', error.message);
      failCount += chunk.length;
    }
  }
  
  return { successCount, failCount, invalidTokens };
};

module.exports = { sendFCMNotification, sendFCMToMultiple, initFirebase };