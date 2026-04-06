const router = require('express').Router();
const { FCMToken } = require('../models');
const { protect } = require('../middleware/auth');

// Save FCM token (called from Flutter app after login)
router.post('/fcm-token', protect, async (req, res) => {
  try {
    const { token, deviceType } = req.body;
    
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token required' });
    }
    
    // Update or create
    await FCMToken.findOneAndUpdate(
      { token: token },
      { 
        userId: req.user._id, 
        deviceType: deviceType || 'android', 
        updatedAt: new Date() 
      },
      { upsert: true, new: true }
    );
    
    console.log(`✅ FCM token saved for user: ${req.user._id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('FCM token save error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Remove FCM token (called on logout)
router.post('/fcm-token/remove', protect, async (req, res) => {
  try {
    const { token } = req.body;
    if (token) {
      await FCMToken.findOneAndDelete({ token: token });
      console.log(`🗑️ FCM token removed: ${token.substring(0, 20)}...`);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Remove all tokens for a user (optional admin endpoint)
router.delete('/fcm-tokens/user', protect, async (req, res) => {
  try {
    await FCMToken.deleteMany({ userId: req.user._id });
    res.json({ success: true, message: 'All tokens removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;