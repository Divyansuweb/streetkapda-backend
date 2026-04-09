// require('dotenv').config();
// const express = require('express');
// const { createServer } = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');
// const { connectDB } = require('./config/db');
// const { initFirebase } = require('./config/firebase');
// const { logger, morganStream } = require('./utils/logger');
// const { errorHandler, notFound } = require('./middleware/errorHandler');
// const { protect, adminOnly } = require('./middleware/auth');
// const {
//   securityHeaders,
//   sanitizeInput,
//   xssProtection,
//   compress,
//   requestLogger,
//   blockSuspicious,
//   configureCors
// } = require('./middleware/security');
// const { 
//   generalLimiter, 
//   authLimiter, 
//   publicLimiter,
//   uploadLimiter 
// } = require('./config/rateLimiter');
// const morgan = require('morgan');

// // Import routes
// const {
//   addressRouter, couponRouter, walletRouter,
//   wishlistRouter, bargainRouter, returnRouter,
// } = require('./routes/misc');

// const app = express();
// const httpServer = createServer(app);

// // Initialize Firebase (only for notifications)
// initFirebase();

// // Socket.IO setup
// const io = new Server(httpServer, {
//   cors: {
//     origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },
//   transports: ['websocket', 'polling'],
//   pingTimeout: 60000,
// });

// // ── Middleware (order matters!) ─────────────────────────────────
// // Security headers
// app.use(securityHeaders);

// // CORS
// app.use(cors(configureCors()));
// app.options('*', cors(configureCors()));

// // Request logging
// app.use(morgan('combined', { stream: morganStream }));
// app.use(requestLogger);

// // Compression
// app.use(compress);

// // Body parsing with limits
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// // Security sanitization
// app.use(blockSuspicious);
// app.use(sanitizeInput);
// app.use(xssProtection);

// // ── Rate Limiting (Applied per route for better control) ────────
// // Apply different rate limits based on route type
// app.use('/api/auth', authLimiter);           // Stricter for authentication
// app.use('/api/products', publicLimiter);     // Permissive for product views
// app.use('/api/banners', publicLimiter);      // Permissive for banners
// app.use('/api/settings', publicLimiter);     // Permissive for settings
// app.use('/api/file', publicLimiter);         // Permissive for file access
// app.use('/api/admin/upload', uploadLimiter); // Stricter for uploads
// app.use('/api', generalLimiter);             // Default for all other routes

// // Attach Socket.IO to app
// app.set('io', io);

// // ── Database Connection ────────────────────────────────────────
// connectDB(app).catch((err) => {
//   logger.error('MongoDB Error:', err);
//   process.exit(1);
// });

// // ── Routes ─────────────────────────────────────────────────────
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/products', require('./routes/products'));
// app.use('/api/orders', require('./routes/orders'));
// app.use('/api/admin', require('./routes/admin'));
// app.use('/api/notifications', require('./routes/notifications'));
// app.use('/api/notifications', require('./routes/fcm'));
// app.use('/api/settings', require('./routes/settings'));
// app.use('/api/addresses', addressRouter);
// app.use('/api/coupons', couponRouter);
// app.use('/api/wallet', walletRouter);
// app.use('/api/wishlist', wishlistRouter);
// app.use('/api/bargain', bargainRouter);
// app.use('/api/returns', returnRouter);
// app.use('/api/file', require('./routes/files'));
// app.use('/api/payments', require('./routes/payment'));
// app.use('/api/referral', require('./routes/referral'));
// app.use('/api/cart', require('./routes/cart'));
// app.use('/api/banners', require('./routes/banners'));

// // Debug endpoint to check rate limit status (admin only)
// app.get('/api/debug/rate-limits', protect, adminOnly, (req, res) => {
//   res.json({
//     success: true,
//     message: 'Rate limit configuration',
//     limits: {
//       general: '300 per minute',
//       auth: '20 per 15 minutes',
//       public: '500 per minute',
//       upload: '200 per hour'
//     },
//     currentTime: new Date().toISOString()
//   });
// });

// // Health check endpoint
// app.get('/health', (req, res) => {
//   res.json({
//     status: 'healthy',
//     timestamp: new Date().toISOString(),
//     uptime: process.uptime(),
//     environment: process.env.NODE_ENV,
//   });
// });

// app.get('/', (req, res) =>
//   res.json({ 
//     message: 'Street Kapda API v4.0', 
//     status: 'running',
//     environment: process.env.NODE_ENV,
//   })
// );

// // ── 404 and Error Handlers ─────────────────────────────────────
// app.use(notFound);
// app.use(errorHandler);

// // ── Socket.IO Events ───────────────────────────────────────────
// io.on('connection', (socket) => {
//   logger.info(`Socket connected: ${socket.id}`);

//   socket.on('join', (userId) => {
//     if (userId && typeof userId === 'string') {
//       socket.join(userId);
//       logger.debug(`User ${userId} joined room`);
//     }
//   });

//   socket.on('leave', (userId) => {
//     if (userId && typeof userId === 'string') {
//       socket.leave(userId);
//       logger.debug(`User ${userId} left room`);
//     }
//   });

//   socket.on('disconnect', () => {
//     logger.info(`Socket disconnected: ${socket.id}`);
//   });
// });

// // ── Graceful Shutdown ──────────────────────────────────────────
// const gracefulShutdown = () => {
//   logger.info('Received shutdown signal, closing gracefully...');
  
//   httpServer.close(() => {
//     logger.info('HTTP server closed');
//     process.exit(0);
//   });
  
//   // Force close after 10 seconds
//   setTimeout(() => {
//     logger.error('Could not close connections in time, forcefully shutting down');
//     process.exit(1);
//   }, 10000);
// };

// process.on('SIGTERM', gracefulShutdown);
// process.on('SIGINT', gracefulShutdown);

// // ── Start Server ───────────────────────────────────────────────
// const PORT = process.env.PORT || 5000;
// // const HOST = process.env.HOST || '192.168.1.13';
// const HOST = process.env.HOST || '0.0.0.0';

// httpServer.listen(PORT, HOST, () => {
//   logger.info(`🚀 Server running on port ${PORT}`);
//   logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
//   logger.info(`📡 API: http://${HOST}:${PORT}/api`);
//   logger.info(`🖼️  Files: http://${HOST}:${PORT}/api/file/<filename>`);
// });





const admin = require('firebase-admin');
const { logger } = require('../utils/logger');

let firebaseApp = null;

const initFirebase = () => {
  try {
    if (firebaseApp) {
      return firebaseApp;
    }

    let serviceAccount = null;
    
    // Method 1: Check for individual env variables
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_CLIENT_EMAIL && 
        process.env.FIREBASE_PRIVATE_KEY) {
      
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      
      // Remove surrounding quotes if present
      privateKey = privateKey.replace(/^"|"$/g, '');
      
      // Replace literal \n with actual newlines
      privateKey = privateKey.replace(/\\n/g, '\n');
      
      // Ensure the key has proper format
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`;
      }
      
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID.trim(),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
        privateKey: privateKey,
      };
      
      logger.info('Firebase config loaded from environment variables');
      logger.info(`Project ID: ${serviceAccount.projectId}`);
      logger.info(`Client Email: ${serviceAccount.clientEmail}`);
      logger.info(`Private Key length: ${serviceAccount.privateKey.length}`);
      logger.info(`Private Key starts with: ${serviceAccount.privateKey.substring(0, 30)}...`);
    }
    // Method 2: Check for JSON string
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        logger.info('Firebase initialized from JSON string');
      } catch (e) {
        logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
      }
    }
    // Method 3: File for development
    else if (process.env.NODE_ENV !== 'production') {
      try {
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
      logger.error('❌ Firebase credentials not found. Push notifications will be disabled.');
      return null;
    }

    // Validate required fields
    if (!serviceAccount.privateKey || !serviceAccount.clientEmail || !serviceAccount.projectId) {
      logger.error('❌ Firebase service account missing required fields');
      logger.error(`  - privateKey: ${!!serviceAccount.privateKey}`);
      logger.error(`  - clientEmail: ${!!serviceAccount.clientEmail}`);
      logger.error(`  - projectId: ${!!serviceAccount.projectId}`);
      return null;
    }

    // Initialize Firebase
    try {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      
      logger.info('✅ Firebase initialized successfully for notifications');
      logger.info(`   Project: ${serviceAccount.projectId}`);
      
      // Test the connection
      setTimeout(async () => {
        try {
          await admin.messaging().send({
            token: 'test',
            notification: { title: 'test', body: 'test' }
          });
        } catch (testError) {
          if (testError.code === 'messaging/invalid-argument') {
            logger.info('✅ Firebase messaging is working (test token invalid - expected)');
          } else {
            logger.error('⚠️ Firebase messaging test failed:', testError.code, testError.message);
          }
        }
      }, 1000);
      
      return firebaseApp;
    } catch (initError) {
      logger.error('❌ Firebase initialization failed:', initError.message);
      logger.error('   This usually means the private key is invalid or corrupted');
      return null;
    }
    
  } catch (error) {
    logger.error('❌ Firebase initialization error:', error.message);
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
    logger.info(`✅ FCM sent successfully to: ${fcmToken.substring(0, 20)}...`);
    return response;
  } catch (error) {
    logger.error(`❌ FCM send error: ${error.code} - ${error.message}`);
    if (error.code === 'messaging/registration-token-not-registered') {
      return { invalidToken: true };
    }
    if (error.code === 'messaging/authentication-error') {
      logger.error('   Authentication failed - check your Firebase service account credentials!');
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
  
  // Filter valid tokens
  const validTokens = tokens.filter(t => t && t.length > 50);
  
  if (validTokens.length === 0) {
    logger.warn('No valid tokens to send notifications');
    return { successCount: 0, failCount: tokens.length };
  }
  
  const chunkSize = 500;
  const chunks = [];
  for (let i = 0; i < validTokens.length; i += chunkSize) {
    chunks.push(validTokens.slice(i, i + chunkSize));
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
      data: {
        title: title.substring(0, 100),
        body: body.substring(0, 200),
        type: data.type || 'general',
        orderId: data.orderId || '',
        notificationId: data.notificationId || '',
      },
      android: {
        priority: 'high',
        notification: { 
          sound: 'default',
          channelId: 'street_kapda_channel',
        },
      },
    }));
    
    try {
      const response = await admin.messaging().sendEach(messages);
      successCount += response.successCount;
      failCount += response.failureCount;
      
      if (response.responses) {
        response.responses.forEach((resp, idx) => {
          if (resp.error) {
            logger.error(`FCM error for token ${chunk[idx].substring(0, 20)}: ${resp.error.code}`);
            if (resp.error.code === 'messaging/registration-token-not-registered') {
              invalidTokens.push(chunk[idx]);
            }
          }
        });
      }
      
      logger.info(`📱 FCM batch: ${response.successCount} success, ${response.failureCount} failures`);
    } catch (error) {
      logger.error(`❌ FCM batch error: ${error.code} - ${error.message}`);
      failCount += chunk.length;
    }
  }
  
  return { successCount, failCount, invalidTokens };
};

module.exports = { sendFCMNotification, sendFCMToMultiple, initFirebase, getFirebaseApp };