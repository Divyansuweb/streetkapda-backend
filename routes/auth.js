

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, WalletTxn } = require('../models');
const { generateToken, protect } = require('../middleware/auth');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../utils/email');
const { validate, registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } = require('../config/validation');
const { authLimiter } = require('../config/rateLimiter');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// Apply rate limiting to auth routes
router.use(authLimiter);

// ── REGISTER ──────────────────────────────────────────────────
router.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const { name, email, phone, password, referralCode } = req.body;

  // Check for existing user
  const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] });
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'User already exists with this email or phone' });
  }

  // Check referral code
  let referrer = null;
  let referralValid = false;
  const rewardAmount = 50;

  if (referralCode && referralCode.trim().length > 0) {
    referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (referrer && referrer._id.toString() !== existingUser?._id?.toString()) {
      referralValid = true;
    }
  }

  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    password: password,
    role: 'user',
    walletBalance: referralValid ? rewardAmount : 0,
    referredBy: referralValid ? referrer.referralCode : null,
  });

  logger.info(`New user registered: ${user.email}`);

  if (referrer && referralValid) {
    await User.findByIdAndUpdate(referrer._id, { $inc: { walletBalance: rewardAmount } });
    await WalletTxn.create({
      userId: referrer._id,
      type: 'CREDIT',
      amount: rewardAmount,
      description: `Referral reward for inviting ${user.phone}`,
    });
    await WalletTxn.create({
      userId: user._id,
      type: 'CREDIT',
      amount: rewardAmount,
      description: 'Welcome bonus from referral',
    });
  }

  // Send welcome email (don't await, fire and forget)
  sendWelcomeEmail(user.email, user.name).catch(err => logger.error('Welcome email failed:', err));

  const token = generateToken(user._id);
  const userResponse = user.toObject();
  delete userResponse.password;
  
  res.json({ success: true, token, user: userResponse });
}));

// ── LOGIN ─────────────────────────────────────────────────────
router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  // Check if account is locked
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const remainingMinutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return res.status(401).json({ 
      success: false, 
      message: `Account locked. Try again in ${remainingMinutes} minutes` 
    });
  }

  const isValid = await user.comparePassword(password);

  if (!isValid) {
    await user.incLoginAttempts();
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  if (!user.isActive) {
    return res.status(401).json({ success: false, message: 'Account is deactivated. Contact support.' });
  }

  // Reset login attempts on successful login
  await User.findByIdAndUpdate(user._id, { 
    loginAttempts: 0, 
    lockUntil: null,
    lastLoginAt: new Date()
  });

  const token = generateToken(user._id);
  const userResponse = user.toObject();
  delete userResponse.password;
  
  logger.info(`User logged in: ${user.email}`);
  res.json({ success: true, token, user: userResponse });
}));

// ── FORGOT PASSWORD ──────────────────────────────────────────
router.post('/forgot-password', validate(forgotPasswordSchema), asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  
  // Always return success for security (don't reveal if email exists)
  if (user) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send email in background
    sendPasswordResetEmail(user.email, resetToken, user.name).catch(err => {
      logger.error('Password reset email failed:', err);
    });
  }

  res.json({ 
    success: true, 
    message: 'If an account exists with this email, you will receive password reset instructions.'
  });
}));

// ── RESET PASSWORD ───────────────────────────────────────────
router.post('/reset-password', validate(resetPasswordSchema), asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  }).select('+resetPasswordToken +resetPasswordExpires');

  if (!user) {
    return res.status(400).json({ success: false, message: 'Password reset link is invalid or has expired' });
  }

  const salt = await bcrypt.genSalt(12);
  user.password = await bcrypt.hash(newPassword, salt);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  logger.info(`Password reset for: ${user.email}`);
  res.json({ success: true, message: 'Password reset successful. Please login with your new password.' });
}));

// ── CHANGE PASSWORD ──────────────────────────────────────────
router.put('/change-password', protect, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);
  const isValid = await user.comparePassword(currentPassword);
  
  if (!isValid) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  const salt = await bcrypt.genSalt(12);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();

  logger.info(`Password changed for user: ${user.email}`);
  res.json({ success: true, message: 'Password changed successfully' });
}));

// ── Verify Reset Token ────────────────────────────────────────
router.get('/verify-reset-token/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  }).select('+resetPasswordToken +resetPasswordExpires');

  res.json({ 
    success: true, 
    valid: !!user,
    ...(user && { email: user.email })
  });
}));

// ── Admin Login ────────────────────────────────────────────────
router.post('/admin-login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase(), role: 'admin' });
  
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const token = generateToken(user._id);
  const userResponse = user.toObject();
  delete userResponse.password;
  
  logger.info(`Admin logged in: ${user.email}`);
  res.json({ success: true, token, user: userResponse });
}));

// ── Get Profile ───────────────────────────────────────────────
router.get('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  res.json({ success: true, user });
}));



// Add a route to check rate limit status (for debugging)
router.get('/rate-limit-status', protect, async (req, res) => {
  res.json({
    success: true,
    message: 'Rate limit info available in headers',
    headers: {
      'X-RateLimit-Limit': req.headers['x-ratelimit-limit'],
      'X-RateLimit-Remaining': req.headers['x-ratelimit-remaining'],
      'X-RateLimit-Reset': req.headers['x-ratelimit-reset']
    }
  });
});

module.exports = router;