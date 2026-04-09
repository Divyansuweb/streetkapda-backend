const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── USER ────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true, index: true },
  phone:         { type: String, required: true, unique: true, index: true },
  password:      { type: String, required: true },
  role:          { type: String, enum: ['user', 'admin'], default: 'user', index: true },
  profileImage:  { type: String },
  walletBalance: { type: Number, default: 0 },
  referralCode:  { type: String, unique: true, sparse: true, index: true },
  referredBy:    { type: String, index: true },
  wishlist:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  isActive:      { type: Boolean, default: true, index: true },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
  lastLoginAt:   { type: Date },
  loginAttempts: { type: Number, default: 0 },
  lockUntil:     { type: Date },
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  try {
    if (this.isModified('password') && this.password) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    }
    
    if (this.isNew && !this.referralCode) {
      let code;
      let isUnique = false;
      while (!isUnique) {
        code = Math.random().toString(36).substring(2, 10).toUpperCase();
        const existing = await mongoose.model('User').findOne({ referralCode: code });
        if (!existing) isUnique = true;
      }
      this.referralCode = code;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Add method to increment login attempts
userSchema.methods.incLoginAttempts = async function() {
  const attempts = this.loginAttempts + 1;
  const lockUntil = attempts >= 5 ? Date.now() + 30 * 60 * 1000 : this.lockUntil;
  
  await this.updateOne({
    $set: { loginAttempts: attempts, lockUntil }
  });
  
  return { attempts, lockUntil };
};

// ── OTP ─────────────────────────────────────────────────────
const otpSchema = new mongoose.Schema({
  phone:     { type: String, required: true, index: true },
  otp:       { type: String, required: true },
  attempts:  { type: Number, default: 0 },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 5 * 60000), index: { expiresAfterSeconds: 0 } },
}, { timestamps: true });

// ── PRODUCT ─────────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true, index: true },
  description:   { type: String, required: true },
  price:         { type: Number, required: true, index: true },
  discountPrice: { type: Number },
  category:      { type: String, required: true, index: true },
  sizes:         [String],
  colors:        [String],
  images:        [String],
  stock:         { type: Number, default: 0, index: true },
  rating:        { type: Number, default: 0 },
  reviewCount:   { type: Number, default: 0 },
  isActive:      { type: Boolean, default: true, index: true },
  isFeatured:    { type: Boolean, default: false, index: true },
  comboOffer:    { type: String },
  sold:          { type: Number, default: 0 },
}, { timestamps: true });

// Compound indexes for common queries
productSchema.index({ category: 1, isActive: 1, price: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ sold: -1 });

// ── ADDRESS ─────────────────────────────────────────────────
const addressSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:      { type: String, required: true },
  phone:     { type: String, required: true },
  line1:     { type: String, required: true },
  line2:     { type: String, default: '' },
  city:      { type: String, required: true },
  state:     { type: String, required: true },
  pincode:   { type: String, required: true, index: true },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

addressSchema.index({ userId: 1, isDefault: 1 });

// ── ORDER ────────────────────────────────────────────────────
const orderItemSchema = new mongoose.Schema({
  productId:    { type: String, required: true },
  productName:  { type: String, required: true },
  productImage: { type: String },
  price:        { type: Number, required: true },
  size:         { type: String },
  color:        { type: String },
  quantity:     { type: Number, default: 1 },
});

const orderSchema = new mongoose.Schema({
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items:          [orderItemSchema],
  address:        { type: Object, required: true },
  subtotal:       { type: Number, required: true },
  deliveryCharge: { type: Number, default: 0 },
  discount:       { type: Number, default: 0 },
  walletAmount:   { type: Number, default: 0 },
  total:          { type: Number, required: true, index: true },
  orderStatus:    {
    type: String,
    enum: ['PENDING_PAYMENT', 'PENDING', 'VERIFIED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
    default: 'PENDING',
    index: true,
  },
  payment: {
    status:         { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED', 'COD_PENDING'], default: 'PENDING', index: true },
    screenshotFile: { type: String },
    verifiedBy:     { type: String },
    verifiedAt:     { type: Date },
    paymentId:      { type: String },
    razorpayOrderId: { type: String },
    signature:      { type: String },
    paymentMethod:  { type: String, enum: ['RAZORPAY', 'COD'], default: 'RAZORPAY' },
  },
  tracking: {
    estimatedDelivery: { type: Date },
    shippedAt: { type: Date },
    outForDeliveryAt: { type: Date },
    deliveredAt: { type: Date },
    trackingNumber: { type: String },
    courierPartner: { type: String },
    statusHistory: [{
      status: { type: String },
      timestamp: { type: Date, default: Date.now },
      note: { type: String },
      updatedBy: { type: String }
    }]
  },
  couponCode:  { type: String, index: true },
  notes:       { type: String },
  deliveredAt: { type: Date },
}, { timestamps: true });

// Compound indexes for order queries
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ 'payment.status': 1, 'payment.paymentMethod': 1 });

// ── NOTIFICATION ─────────────────────────────────────────────
const notificationSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  type:    { type: String, default: 'general', index: true },
  isRead:  { type: Boolean, default: false, index: true },
  orderId: { type: String },
  imageUrl:{ type: String },
}, { timestamps: true });

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// ── COUPON ───────────────────────────────────────────────────
const couponSchema = new mongoose.Schema({
  code:           { type: String, required: true, unique: true, uppercase: true, index: true },
  discountType:   { type: String, enum: ['FLAT', 'PERCENT'], required: true },
  discountValue:  { type: Number, required: true },
  minOrderAmount: { type: Number, default: 0 },
  maxDiscount:    { type: Number },
  isActive:       { type: Boolean, default: true, index: true },
  usedCount:      { type: Number, default: 0 },
  expiresAt:      { type: Date, index: true },
}, { timestamps: true });

// ── RETURN REQUEST ────────────────────────────────────────────
const returnSchema = new mongoose.Schema({
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reason:    { type: String, required: true },
  images:    [String],
  status:    { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
  adminNote: { type: String },
}, { timestamps: true });

// ── BARGAIN ───────────────────────────────────────────────────
const bargainSchema = new mongoose.Schema({
  productId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  suggestedPrice: { type: Number, required: true },
  status:         { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING', index: true },
  adminNote:      { type: String },
}, { timestamps: true });

// ── WALLET TRANSACTION ────────────────────────────────────────
const walletTxnSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:        { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
  amount:      { type: Number, required: true },
  description: { type: String, required: true },
  orderId:     { type: String },
}, { timestamps: true });

walletTxnSchema.index({ userId: 1, createdAt: -1 });

// ── REVIEW ───────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userName:    { type: String, required: true },
  rating:      { type: Number, required: true, min: 1, max: 5 },
  comment:     { type: String, required: true },
  reviewImage: { type: String },
  isApproved:  { type: Boolean, default: true, index: true },
}, { timestamps: true });

reviewSchema.index({ productId: 1, isApproved: 1, createdAt: -1 });

// ── APP SETTINGS ──────────────────────────────────────────────
const settingsSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true, index: true },
  value: { type: mongoose.Schema.Types.Mixed },
  label: { type: String },
  group: { type: String, default: 'general', index: true },
}, { timestamps: true });

// ── FCM TOKEN ────────────────────────────────────────────────
const fcmTokenSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token:     { type: String, required: true, unique: true },
  deviceType: { type: String, enum: ['android', 'ios', 'web'], default: 'android' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

fcmTokenSchema.index({ userId: 1, updatedAt: 1 });

// ── CART ─────────────────────────────────────────────────────
const cartItemSchema = new mongoose.Schema({
  productId:    { type: String, required: true },
  productName:  { type: String, required: true },
  productPrice: { type: Number, required: true },
  productDiscountPrice: { type: Number },
  productImage: { type: String },
  selectedSize: { type: String, required: true },
  selectedColor: { type: String },
  quantity:     { type: Number, default: 1 },
  productStock: { type: Number, default: 0 },
  productCategory: { type: String },
  productSizes: [String],
  productColors: [String],
});

const cartSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  items:     [cartItemSchema],
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// ── BANNER ─────────────────────────────────────────────────────
const bannerSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  subtitle:    { type: String, default: '' },
  image:       { type: String },
  textColor:   { type: String, default: '#FFFFFF' },
  order:       { type: Number, default: 0, index: true },
  isActive:    { type: Boolean, default: true, index: true },
  backgroundColor: { type: String, default: '#1A2C3E' },
}, { timestamps: true });

// Create models
const User = mongoose.model('User', userSchema);
const OTP = mongoose.model('OTP', otpSchema);
const Product = mongoose.model('Product', productSchema);
const Address = mongoose.model('Address', addressSchema);
const Order = mongoose.model('Order', orderSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Coupon = mongoose.model('Coupon', couponSchema);
const ReturnRequest = mongoose.model('ReturnRequest', returnSchema);
const BargainRequest = mongoose.model('BargainRequest', bargainSchema);
const WalletTxn = mongoose.model('WalletTxn', walletTxnSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Review = mongoose.model('Review', reviewSchema);
const FCMToken = mongoose.model('FCMToken', fcmTokenSchema);
const Cart = mongoose.model('Cart', cartSchema);
const Banner = mongoose.model('Banner', bannerSchema);

module.exports = {
  User, OTP, Product, Address, Order, Notification,
  Coupon, ReturnRequest, BargainRequest, WalletTxn,
  Settings, Review, FCMToken, Cart, Banner,
};