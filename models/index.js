
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── USER ────────────────────────────────────────────────────



// ── USER ────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true },
  phone:         { type: String, required: true, unique: true },
  password:      { type: String },
  role:          { type: String, enum: ['user', 'admin'], default: 'user' },
  profileImage:  { type: String },
  walletBalance: { type: Number, default: 0 },
  referralCode:  { type: String, unique: true, sparse: true },
  referredBy:    { type: String },
  wishlist:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

// Fix: Only generate referral code on initial creation, NOT on every save
userSchema.pre('save', async function (next) {
  // Only hash password if modified
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  
  // Only generate referral code if it doesn't exist (new document)
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
});

userSchema.methods.comparePassword = function (p) {
  return bcrypt.compare(p, this.password || '');
};


// ── OTP ─────────────────────────────────────────────────────
const otpSchema = new mongoose.Schema({
  phone:     { type: String, required: true },
  otp:       { type: String, required: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 5 * 60000) },
}, { timestamps: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ── PRODUCT ─────────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  description:   { type: String, required: true },
  price:         { type: Number, required: true },
  discountPrice: { type: Number },
  category:      { type: String, required: true },
  sizes:         [String],
  colors:        [String],
  images:        [String],
  stock:         { type: Number, default: 0 },
  rating:        { type: Number, default: 0 },
  reviewCount:   { type: Number, default: 0 },
  isActive:      { type: Boolean, default: true },
  isFeatured:    { type: Boolean, default: false },
  comboOffer:    { type: String },
  sold:          { type: Number, default: 0 },
}, { timestamps: true });
productSchema.index({ name: 'text', description: 'text', category: 'text' });

// ── ADDRESS ─────────────────────────────────────────────────
const addressSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:      { type: String, required: true },
  phone:     { type: String, required: true },
  line1:     { type: String, required: true },
  line2:     { type: String, default: '' },
  city:      { type: String, required: true },
  state:     { type: String, required: true },
  pincode:   { type: String, required: true },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

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
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items:          [orderItemSchema],
  address:        { type: Object, required: true },
  subtotal:       { type: Number, required: true },
  deliveryCharge: { type: Number, default: 0 },
  discount:       { type: Number, default: 0 },
  walletAmount:   { type: Number, default: 0 },
  total:          { type: Number, required: true },
  orderStatus:    {
    type: String,
    enum: ['PENDING_PAYMENT', 'PENDING', 'VERIFIED', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    default: 'PENDING',
  },
  payment: {
    status:         { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
    screenshotFile: { type: String },
    verifiedBy:     { type: String },
    verifiedAt:     { type: Date },
    paymentId:      { type: String },
    razorpayOrderId: { type: String },
    signature:      { type: String },
  },
  couponCode:  { type: String },
  notes:       { type: String },
  deliveredAt: { type: Date },
}, { timestamps: true });

// ── NOTIFICATION ─────────────────────────────────────────────
const notificationSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  type:    { type: String, default: 'general' },
  isRead:  { type: Boolean, default: false },
  orderId: { type: String },
  imageUrl:{ type: String },
}, { timestamps: true });
notificationSchema.index({ userId: 1, createdAt: -1 });

// ── COUPON ───────────────────────────────────────────────────
const couponSchema = new mongoose.Schema({
  code:           { type: String, required: true, unique: true, uppercase: true },
  discountType:   { type: String, enum: ['FLAT', 'PERCENT'], required: true },
  discountValue:  { type: Number, required: true },
  minOrderAmount: { type: Number, default: 0 },
  maxDiscount:    { type: Number },
  isActive:       { type: Boolean, default: true },
  usedCount:      { type: Number, default: 0 },
  expiresAt:      { type: Date },
}, { timestamps: true });

// ── RETURN REQUEST ────────────────────────────────────────────
const returnSchema = new mongoose.Schema({
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason:    { type: String, required: true },
  images:    [String],
  status:    { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  adminNote: { type: String },
}, { timestamps: true });

// ── BARGAIN ───────────────────────────────────────────────────
const bargainSchema = new mongoose.Schema({
  productId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  suggestedPrice: { type: Number, required: true },
  status:         { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' },
  adminNote:      { type: String },
}, { timestamps: true });

// ── WALLET TRANSACTION ────────────────────────────────────────
const walletTxnSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:        { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
  amount:      { type: Number, required: true },
  description: { type: String, required: true },
  orderId:     { type: String },
}, { timestamps: true });

// ── REVIEW ───────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:    { type: String, required: true },
  rating:      { type: Number, required: true, min: 1, max: 5 },
  comment:     { type: String, required: true },
  reviewImage: { type: String },
  isApproved:  { type: Boolean, default: true },
}, { timestamps: true });
reviewSchema.index({ productId: 1, createdAt: -1 });

// ── APP SETTINGS ──────────────────────────────────────────────
const settingsSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
  label: { type: String },
  group: { type: String, default: 'general' },
}, { timestamps: true });

// ── FCM TOKEN ────────────────────────────────────────────────
const fcmTokenSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token:     { type: String, required: true, unique: true },
  deviceType: { type: String, enum: ['android', 'ios', 'web'], default: 'android' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

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
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items:     [cartItemSchema],
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });


// ── BANNER ─────────────────────────────────────────────────────
const bannerSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  subtitle:    { type: String, default: '' },
  image:       { type: String }, // Image filename from GridFS
  textColor:   { type: String, default: '#FFFFFF' },
  order:       { type: Number, default: 0 },
  isActive:    { type: Boolean, default: true },
  backgroundColor: { type: String, default: '#1A2C3E' }, // Fallback color
}, { timestamps: true });



module.exports = {
  User:           mongoose.model('User', userSchema),
  OTP:            mongoose.model('OTP', otpSchema),
  Product:        mongoose.model('Product', productSchema),
  Address:        mongoose.model('Address', addressSchema),
  Order:          mongoose.model('Order', orderSchema),
  Notification:   mongoose.model('Notification', notificationSchema),
  Coupon:         mongoose.model('Coupon', couponSchema),
  ReturnRequest:  mongoose.model('ReturnRequest', returnSchema),
  BargainRequest: mongoose.model('BargainRequest', bargainSchema),
  WalletTxn:      mongoose.model('WalletTxn', walletTxnSchema),
  Settings:       mongoose.model('Settings', settingsSchema),
  Review:         mongoose.model('Review', reviewSchema),
  FCMToken:       mongoose.model('FCMToken', fcmTokenSchema),
  Cart:           mongoose.model('Cart', cartSchema),
  Banner:         mongoose.model('Banner', bannerSchema),
};