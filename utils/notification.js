const { Notification, FCMToken, User } = require('../models');
const { sendFCMNotification, sendFCMToMultiple } = require('../config/firebase');
const { logger } = require('./logger');

/**
 * Create a notification and emit via Socket.IO + FCM
 * @param {Object} app  - Express app (has io attached)
 * @param {Object} opts - { userId, title, message, type, orderId, imageUrl }
 */
const sendNotification = async (app, opts) => {
  try {
    // Validate required fields
    if (!opts.userId || !opts.title || !opts.message) {
      logger.error('Missing required fields for notification', opts);
      return null;
    }
    
    // Truncate long messages
    const title = opts.title.substring(0, 100);
    const message = opts.message.substring(0, 500);
    
    // Create notification in database
    const notif = await Notification.create({
      userId: opts.userId,
      title: title,
      message: message,
      type: opts.type || 'general',
      orderId: opts.orderId || null,
      imageUrl: opts.imageUrl || null,
    });

    // Emit via Socket.IO for real-time in-app
    const io = app?.get('io');
    if (io) {
      io.to(opts.userId.toString()).emit('notification', notif);
      logger.debug(`Socket.IO emitted to user: ${opts.userId}`);
    }

    // Send FCM Push Notification (only if configured)
    const userTokens = await FCMToken.find({ userId: opts.userId });
    if (userTokens && userTokens.length > 0) {
      const tokens = userTokens.map(t => t.token);
      logger.info(`Sending FCM to ${tokens.length} device(s) for user ${opts.userId}`);
      
      const result = await sendFCMToMultiple(tokens, title, message, {
        notificationId: notif._id.toString(),
        orderId: opts.orderId || '',
        type: opts.type || 'general',
      });
      
      if (result.invalidTokens && result.invalidTokens.length > 0) {
        // Remove invalid tokens
        await FCMToken.deleteMany({ token: { $in: result.invalidTokens } });
        logger.info(`Removed ${result.invalidTokens.length} invalid FCM tokens`);
      }
    }

    return notif;
  } catch (err) {
    logger.error('sendNotification error:', err.message);
    return null;
  }
};

/**
 * Broadcast notification to ALL users
 */
const broadcastNotification = async (app, opts) => {
  try {
    // Get all active users
    const users = await User.find({ role: 'user', isActive: true }).select('_id');
    logger.info(`Broadcasting to ${users.length} users`);
    
    // Truncate message
    const title = opts.title.substring(0, 100);
    const message = opts.message.substring(0, 500);
    
    // Get all FCM tokens
    const allTokens = await FCMToken.find({ 
      userId: { $in: users.map(u => u._id) } 
    });
    
    const uniqueTokens = [...new Set(allTokens.map(t => t.token))];
    logger.info(`Found ${uniqueTokens.length} unique FCM tokens`);
    
    // Send FCM to all tokens (batch) - only if tokens exist
    if (uniqueTokens.length > 0) {
      await sendFCMToMultiple(uniqueTokens, title, message, {
        type: opts.type || 'promo',
      });
    }
    
    // Create database records and emit socket events (batched)
    const batchSize = 100;
    const results = [];
    
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      const notifications = await Notification.insertMany(
        batch.map(user => ({
          userId: user._id,
          title: title,
          message: message,
          type: opts.type || 'promo',
        }))
      );
      
      // Socket emit to each user
      const io = app?.get('io');
      if (io) {
        for (const notif of notifications) {
          io.to(notif.userId.toString()).emit('notification', notif);
        }
      }
      
      results.push(...notifications);
    }
    
    logger.info(`Broadcast complete: ${results.length} notifications sent`);
    return results;
  } catch (err) {
    logger.error('broadcastNotification error:', err.message);
    return [];
  }
};

/**
 * Send notification to multiple users
 */
const sendNotificationToMultiple = async (app, userIds, opts) => {
  try {
    const results = [];
    const batchSize = 50;
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const promises = batch.map(userId => sendNotification(app, { ...opts, userId }));
      const batchResults = await Promise.all(promises);
      results.push(...batchResults.filter(r => r));
    }
    
    return results;
  } catch (err) {
    logger.error('sendNotificationToMultiple error:', err.message);
    return [];
  }
};

module.exports = { sendNotification, broadcastNotification, sendNotificationToMultiple };