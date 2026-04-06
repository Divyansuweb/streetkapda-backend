const router  = require('express').Router();
const express = require('express');
const { Address, Coupon, WalletTxn, User, Notification,
        BargainRequest, ReturnRequest, Order } = require('../models');
const { protect } = require('../middleware/auth');

// ══════════════════════════════════════════════════════════════
// ADDRESSES
// ══════════════════════════════════════════════════════════════
const addressRouter = express.Router();

addressRouter.get('/', protect, async (req, res) => {
  try {
    const addresses = await Address.find({ userId: req.user._id }).sort({ isDefault: -1 });
    res.json({ success: true, addresses });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

addressRouter.post('/', protect, async (req, res) => {
  try {
    if (req.body.isDefault)
      await Address.updateMany({ userId: req.user._id }, { isDefault: false });
    const address = await Address.create({ ...req.body, userId: req.user._id });
    res.status(201).json({ success: true, address });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

addressRouter.put('/:id', protect, async (req, res) => {
  try {
    if (req.body.isDefault)
      await Address.updateMany({ userId: req.user._id }, { isDefault: false });
    const address = await Address.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true }
    );
    res.json({ success: true, address });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

addressRouter.delete('/:id', protect, async (req, res) => {
  try {
    await Address.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true, message: 'Address deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// COUPONS (user)
// ══════════════════════════════════════════════════════════════
const couponRouter = express.Router();

couponRouter.post('/validate', protect, async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon)
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    if (coupon.expiresAt && coupon.expiresAt < new Date())
      return res.status(400).json({ success: false, message: 'Coupon expired' });
    if (orderAmount < coupon.minOrderAmount)
      return res.status(400).json({ success: false, message: `Min order ₹${coupon.minOrderAmount} required` });

    let discount = coupon.discountType === 'FLAT'
      ? coupon.discountValue
      : (orderAmount * coupon.discountValue) / 100;
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);

    res.json({ success: true, discount, coupon });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// WALLET
// ══════════════════════════════════════════════════════════════
const walletRouter = express.Router();

walletRouter.get('/', protect, async (req, res) => {
  try {
    const transactions = await WalletTxn.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    const user = await User.findById(req.user._id);
    res.json({ success: true, balance: user.walletBalance, transactions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// WISHLIST
// ══════════════════════════════════════════════════════════════
const wishlistRouter = express.Router();

wishlistRouter.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('wishlist');
    res.json({ success: true, products: user.wishlist });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

wishlistRouter.post('/toggle/:productId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const idx  = user.wishlist.indexOf(req.params.productId);
    if (idx >= 0) user.wishlist.splice(idx, 1);
    else          user.wishlist.push(req.params.productId);
    await user.save();
    res.json({ success: true, wishlist: user.wishlist });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// BARGAIN
// ══════════════════════════════════════════════════════════════
const bargainRouter = express.Router();

bargainRouter.post('/', protect, async (req, res) => {
  try {
    const { productId, suggestedPrice } = req.body;
    const bargain = await BargainRequest.create({ productId, userId: req.user._id, suggestedPrice });
    res.status(201).json({ success: true, bargain, message: 'Bargain request sent!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

bargainRouter.get('/', protect, async (req, res) => {
  try {
    const bargains = await BargainRequest.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('productId', 'name images price');
    res.json({ success: true, bargains });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Admin bargain routes
bargainRouter.get('/all', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Admin only' });
    const bargains = await BargainRequest.find()
      .sort({ createdAt: -1 })
      .populate('productId', 'name images price')
      .populate('userId', 'name phone');
    res.json({ success: true, bargains });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

bargainRouter.put('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Admin only' });
    const bargain = await BargainRequest.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, bargain });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// RETURNS
// ══════════════════════════════════════════════════════════════
const returnRouter = express.Router();

returnRouter.post('/', protect, async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    const order = await Order.findOne({ _id: orderId, userId: req.user._id });
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.orderStatus !== 'DELIVERED')
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
    const returnReq = await ReturnRequest.create({ orderId, userId: req.user._id, reason });
    res.status(201).json({ success: true, returnReq });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

returnRouter.get('/', protect, async (req, res) => {
  try {
    const returns = await ReturnRequest.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, returns });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = {
  addressRouter,
  couponRouter,
  walletRouter,
  wishlistRouter,
  bargainRouter,
  returnRouter,
};
