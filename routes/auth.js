const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { User, OTP, WalletTxn } = require('../models');
const { generateToken, protect } = require('../middleware/auth');

// ── Send OTP ──────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });

    await OTP.deleteMany({ phone });

    const otp = process.env.NODE_ENV === 'production'
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : '123456';

    await OTP.create({ phone, otp });
    console.log(`OTP for ${phone}: ${otp}`);

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Verify OTP & Login/Register ───────────────────────────────

// ── Verify OTP & Login/Register ───────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp, name, email, isRegister, referralCode } = req.body;

    const otpDoc = await OTP.findOne({ phone });
    if (!otpDoc || otpDoc.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    await OTP.deleteMany({ phone });

    let user = await User.findOne({ phone });

    if (!user) {
      if (!isRegister) {
        return res.status(404).json({ success: false, message: 'Account not found. Please register.' });
      }

      // Check if referral code exists and is valid
      let referrer = null;
      let referralValid = false;
      let referralErrorMessage = null;
      const rewardAmount = 50;

      if (referralCode && referralCode.trim().length > 0) {
        const upperCode = referralCode.toUpperCase();
        referrer = await User.findOne({ referralCode: upperCode });
        
        if (!referrer) {
          referralErrorMessage = 'Invalid referral code';
        } else if (referrer._id.toString() === user?._id?.toString()) {
          referralErrorMessage = 'You cannot use your own referral code';
        } else {
          // Check if this referrer's code has already been used by this phone number
          const existingReferred = await User.findOne({ 
            referredBy: upperCode,
            phone: phone 
          });
          
          if (existingReferred) {
            referralErrorMessage = 'This referral code has already been used by this number';
          } else {
            referralValid = true;
          }
        }
      }

      // Create new user
      user = await User.create({
        name: name || phone,
        email: email || `${phone}@temp.com`,
        phone,
        role: 'user',
        walletBalance: referralValid ? rewardAmount : 0,
        referredBy: referralValid ? referrer.referralCode : null,
      });

      // Give reward to referrer (only if valid and not already rewarded)
      if (referrer && referralValid) {
        // Check if referrer already got reward for this phone number
        const existingReward = await WalletTxn.findOne({
          userId: referrer._id,
          description: { $regex: `referring ${phone}`, $options: 'i' }
        });
        
        if (!existingReward) {
          await User.findByIdAndUpdate(referrer._id, {
            $inc: { walletBalance: rewardAmount }
          });

          // Create wallet transaction for referrer
          await WalletTxn.create({
            userId: referrer._id,
            type: 'CREDIT',
            amount: rewardAmount,
            description: `Referral reward for inviting ${user.phone}`,
          });

          // Create wallet transaction for new user
          await WalletTxn.create({
            userId: user._id,
            type: 'CREDIT',
            amount: rewardAmount,
            description: 'Welcome bonus from referral',
          });

          // Send notification to referrer
          const { sendNotification } = require('../utils/notification');
          if (req.app) {
            await sendNotification(req.app, {
              userId: referrer._id,
              title: 'Referral Reward! 🎉',
              message: `₹${rewardAmount} credited to your wallet for referring ${user.name || user.phone}`,
              type: 'general',
            });
          }
        }
      }

      // If referral code was invalid, still create user but show warning
      if (referralCode && referralCode.trim().length > 0 && !referralValid) {
        console.log(`Invalid referral attempt: ${referralCode} for phone ${phone}`);
      }
      
    } else if (isRegister) {
      // Existing user trying to register again - just update info
      if (name) user.name = name;
      if (email) user.email = email;
      await user.save();
    }

    const token = generateToken(user._id);
    res.json({ success: true, token, user });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// router.post('/verify-otp', async (req, res) => {
//   try {
//     const { phone, otp, name, email, isRegister, referralCode } = req.body;

//     const otpDoc = await OTP.findOne({ phone });
//     if (!otpDoc || otpDoc.otp !== otp) {
//       return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
//     }

//     await OTP.deleteMany({ phone });

//     let user = await User.findOne({ phone });

//     if (!user) {
//       if (!isRegister) {
//         return res.status(404).json({ success: false, message: 'Account not found. Please register.' });
//       }

//       // Check if referral code exists
//       let referrer = null;
//       let referralValid = false;
//       const rewardAmount = 50;

//       if (referralCode && referralCode.trim().length > 0) {
//         referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
//         if (referrer) {
//           referralValid = true;
//         }
//       }

//       // Create new user with initial wallet balance if referred
//       user = await User.create({
//         name: name || phone,
//         email: email || `${phone}@temp.com`,
//         phone,
//         role: 'user',
//         walletBalance: referralValid ? rewardAmount : 0,
//         referredBy: referralValid ? referrer.referralCode : null,
//       });

//       // Give reward to referrer
//       if (referrer && referralValid) {
//         await User.findByIdAndUpdate(referrer._id, {
//           $inc: { walletBalance: rewardAmount }
//         });

//         // Create wallet transaction for referrer
//         await WalletTxn.create({
//           userId: referrer._id,
//           type: 'CREDIT',
//           amount: rewardAmount,
//           description: `Referral reward for inviting ${user.phone}`,
//         });

//         // Create wallet transaction for new user
//         await WalletTxn.create({
//           userId: user._id,
//           type: 'CREDIT',
//           amount: rewardAmount,
//           description: 'Welcome bonus from referral',
//         });

//         // Send notification to referrer
//         const { sendNotification } = require('../utils/notification');
//         if (req.app) {
//           await sendNotification(req.app, {
//             userId: referrer._id,
//             title: 'Referral Reward! 🎉',
//             message: `₹${rewardAmount} credited to your wallet for referring ${user.name || user.phone}`,
//             type: 'general',
//           });
//         }
//       }
//     } else if (isRegister) {
//       // Existing user updating info
//       if (name) user.name = name;
//       if (email) user.email = email;
//       await user.save();
//     }

//     const token = generateToken(user._id);
//     res.json({ success: true, token, user });
//   } catch (err) {
//     console.error('Verify OTP error:', err);
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// ── Admin Login ───────────────────────────────────────────────
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, role: 'admin' });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = generateToken(user._id);
    res.json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get Profile ───────────────────────────────────────────────
router.get('/profile', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── Update Profile ────────────────────────────────────────────
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { ...(name && { name }), ...(email && { email }) },
      { new: true }
    ).select('-password');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;