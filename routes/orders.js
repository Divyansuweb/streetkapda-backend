const router = require('express').Router();
const { Order, Product, User, WalletTxn, Coupon, Address } = require('../models');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { sendNotification } = require('../utils/notification');

// ── Place order ───────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const { items, addressId, subtotal, deliveryCharge,
            couponCode, couponDiscount, walletAmount, total } = req.body;

    const address = await Address.findOne({ _id: addressId, userId: req.user._id });
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });

    // Deduct wallet
    if (walletAmount > 0) {
      const user = await User.findById(req.user._id);
      if (user.walletBalance < walletAmount)
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      user.walletBalance -= walletAmount;
      await user.save();
      await WalletTxn.create({
        userId:      req.user._id,
        type:        'DEBIT',
        amount:      walletAmount,
        description: 'Used for order payment',
      });
    }

    // Mark coupon used
    if (couponCode) await Coupon.findOneAndUpdate({ code: couponCode }, { $inc: { usedCount: 1 } });

    const order = await Order.create({
      userId:         req.user._id,
      items,
      address:        address.toObject(),
      subtotal,
      deliveryCharge: deliveryCharge || 0,
      discount:       couponDiscount  || 0,
      walletAmount:   walletAmount    || 0,
      total,
      couponCode,
    });

    // Decrement stock
    for (const item of items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity, sold: item.quantity },
      });
    }

    await sendNotification(req.app, {
      userId:  req.user._id,
      title:   'Order Placed! 🛍️',
      message: `Order #${order._id.toString().slice(-8).toUpperCase()} placed successfully. Please upload your payment screenshot.`,
      type:    'order',
      orderId: order._id.toString(),
    });

    res.status(201).json({ success: true, orderId: order._id, order });
  } catch (err) {
    console.error('Place order error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── User's orders ─────────────────────────────────────────────
router.get('/user', protect, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Single order ──────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Not authorised' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Upload payment screenshot ─────────────────────────────────
router.post('/:id/payment', protect, upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Screenshot is required' });

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { 'payment.screenshotFile': req.file.filename },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    req.app.get('io')?.emit('new_payment', { orderId: order._id, userId: req.user._id });

    res.json({ success: true, message: 'Payment screenshot uploaded', order });
  } catch (err) {
    console.error('Payment upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create temporary order (before payment)
router.post('/temp', protect, async (req, res) => {
  try {
    const { items, addressId, subtotal, deliveryCharge,
            couponCode, couponDiscount, walletAmount, total } = req.body;

    const address = await Address.findOne({ _id: addressId, userId: req.user._id });
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });

    // Deduct wallet if used
    if (walletAmount > 0) {
      const user = await User.findById(req.user._id);
      if (user.walletBalance < walletAmount)
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      user.walletBalance -= walletAmount;
      await user.save();
      await WalletTxn.create({
        userId: req.user._id,
        type: 'DEBIT',
        amount: walletAmount,
        description: 'Held for order payment',
      });
    }

    const order = await Order.create({
      userId: req.user._id,
      items,
      address: address.toObject(),
      subtotal,
      deliveryCharge: deliveryCharge || 0,
      discount: couponDiscount || 0,
      walletAmount: walletAmount || 0,
      total,
      couponCode,
      orderStatus: 'PENDING_PAYMENT',
      'payment.status': 'PENDING',
    });

    res.status(201).json({ success: true, orderId: order._id });
  } catch (err) {
    console.error('Temp order error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Confirm order after payment
router.post('/confirm', protect, async (req, res) => {
  try {
    const { tempOrderId, paymentId, signature, razorpayOrderId } = req.body;
    
    const tempOrder = await Order.findById(tempOrderId);
    if (!tempOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    if (tempOrder.orderStatus !== 'PENDING_PAYMENT') {
      return res.status(400).json({ success: false, message: 'Invalid order state' });
    }
    
    // Update order with payment info
    tempOrder.orderStatus = 'VERIFIED';
    tempOrder['payment.status'] = 'VERIFIED';
    tempOrder['payment.paymentId'] = paymentId;
    tempOrder['payment.razorpayOrderId'] = razorpayOrderId;
    tempOrder['payment.signature'] = signature;
    await tempOrder.save();
    
    // Decrement stock
    for (const item of tempOrder.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity, sold: item.quantity },
      });
    }
    
    // Send success notification (ONLY after payment)
    await sendNotification(req.app, {
      userId: tempOrder.userId,
      title: 'Order Placed! 🛍️',
      message: `Order #${tempOrder._id.toString().slice(-8).toUpperCase()} confirmed successfully.`,
      type: 'order',
      orderId: tempOrder._id.toString(),
    });
    
    res.json({ success: true, orderId: tempOrder._id });
  } catch (err) {
    console.error('Confirm order error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete temporary order (on payment failure)
router.delete('/temp/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (order && order.orderStatus === 'PENDING_PAYMENT') {
      // Refund wallet if deducted
      if (order.walletAmount > 0) {
        const user = await User.findById(order.userId);
        if (user) {
          user.walletBalance += order.walletAmount;
          await user.save();
        }
      }
      await Order.findByIdAndDelete(req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
