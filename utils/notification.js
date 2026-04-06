
const { Notification, FCMToken, User } = require('../models');
const { sendFCMNotification, sendFCMToMultiple } = require('../config/firebase');

/**
 * Create a notification and emit via Socket.IO + FCM
 * @param {Object} app  - Express app (has io attached)
 * @param {Object} opts - { userId, title, message, type, orderId, imageUrl }
 */
const sendNotification = async (app, opts) => {
  try {
    // Create notification in database
    const notif = await Notification.create({
      userId:   opts.userId,
      title:    opts.title,
      message:  opts.message,
      type:     opts.type     || 'general',
      orderId:  opts.orderId  || null,
      imageUrl: opts.imageUrl || null,
    });

    // Emit via Socket.IO for real-time in-app
    const io = app?.get('io');
    if (io) {
      io.to(opts.userId.toString()).emit('notification', notif);
      console.log(`📡 Socket.IO emitted to user: ${opts.userId}`);
    }

    // Send FCM Push Notification (for when app is closed)
    const userTokens = await FCMToken.find({ userId: opts.userId });
    if (userTokens && userTokens.length > 0) {
      const tokens = userTokens.map(t => t.token);
      console.log(`📱 Sending FCM to ${tokens.length} device(s) for user ${opts.userId}`);
      
      const result = await sendFCMToMultiple(tokens, opts.title, opts.message, {
        notificationId: notif._id.toString(),
        orderId: opts.orderId || '',
        type: opts.type || 'general',
      });
      
      if (result && result.invalidTokens) {
        // Remove invalid tokens
        await FCMToken.deleteMany({ token: { $in: result.invalidTokens } });
      }
    } else {
      console.log(`⚠️ No FCM tokens found for user: ${opts.userId}`);
    }

    return notif;
  } catch (err) {
    console.error('sendNotification error:', err.message);
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
    console.log(`📢 Broadcasting to ${users.length} users`);
    
    // Get all FCM tokens
    const allTokens = await FCMToken.find({ 
      userId: { $in: users.map(u => u._id) } 
    });
    
    const uniqueTokens = [...new Set(allTokens.map(t => t.token))];
    console.log(`📱 Found ${uniqueTokens.length} unique FCM tokens`);
    
    // Send FCM to all tokens (batch)
    if (uniqueTokens.length > 0) {
      await sendFCMToMultiple(uniqueTokens, opts.title, opts.message, {
        type: opts.type || 'promo',
      });
    }
    
    // Create database records and emit socket events
    const results = [];
    for (const user of users) {
      const notif = await Notification.create({
        userId: user._id,
        title: opts.title,
        message: opts.message,
        type: opts.type || 'promo',
      });
      results.push(notif);
      
      // Socket emit to each user
      const io = app?.get('io');
      if (io) {
        io.to(user._id.toString()).emit('notification', notif);
      }
    }
    
    console.log(`✅ Broadcast complete: ${results.length} notifications sent`);
    return results;
  } catch (err) {
    console.error('broadcastNotification error:', err.message);
    return [];
  }
};

/**
 * Send notification to multiple users
 */
const sendNotificationToMultiple = async (app, userIds, opts) => {
  try {
    const results = [];
    for (const userId of userIds) {
      const notif = await sendNotification(app, { ...opts, userId });
      if (notif) results.push(notif);
    }
    return results;
  } catch (err) {
    console.error('sendNotificationToMultiple error:', err.message);
    return [];
  }
};

module.exports = { sendNotification, broadcastNotification, sendNotificationToMultiple };