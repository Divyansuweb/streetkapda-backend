const router = require('express').Router();
const { User, WalletTxn } = require('../models');
const { protect } = require('../middleware/auth');

// Get referral stats and earnings
router.get('/stats', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Find users who used this user's referral code
    const referredUsers = await User.find({ 
      referredBy: user.referralCode 
    }).select('name phone createdAt');
    
    // Calculate total earnings from referrals
    const transactions = await WalletTxn.find({
      userId: user._id,
      description: { $regex: 'Referral reward', $options: 'i' }
    });
    
    const totalEarned = transactions.reduce((sum, t) => sum + t.amount, 0);
    
    res.json({
      success: true,
      stats: {
        referralCode: user.referralCode,
        totalReferred: referredUsers.length,
        totalEarned: totalEarned,
        referredUsers: referredUsers,
        rewardAmount: 50, // Configured reward amount
      }
    });
  } catch (err) {
    console.error('Referral stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get referral leaderboard (optional)
router.get('/leaderboard', protect, async (req, res) => {
  try {
    const users = await User.aggregate([
      { $match: { role: 'user', referredBy: { $ne: null } } },
      { $group: { _id: '$referredBy', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Populate user details
    const leaderboard = await Promise.all(users.map(async (entry) => {
      const user = await User.findOne({ referralCode: entry._id }).select('name phone');
      return {
        name: user?.name || 'Unknown',
        referralCode: entry._id,
        count: entry.count,
      };
    }));
    
    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Check if referral code is valid (before registration)
router.get('/check/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const user = await User.findOne({ referralCode: code.toUpperCase() });
    
    if (!user) {
      return res.json({ 
        success: false, 
        valid: false, 
        message: 'Invalid referral code' 
      });
    }
    
    res.json({ 
      success: true, 
      valid: true, 
      message: `Valid! You'll get ₹50 bonus from ${user.name}`,
      referrerName: user.name 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;