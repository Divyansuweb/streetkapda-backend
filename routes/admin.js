const router = require('express').Router();
const { Order, Product, User, WalletTxn, ReturnRequest,
        Coupon, Notification, Review, Settings } = require('../models');
const { protect, adminOnly } = require('../middleware/auth');
const { sendNotification, broadcastNotification } = require('../utils/notification');

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard', protect, adminOnly, async (req, res) => {
  try {
    const [totalOrders, totalProducts, totalUsers, revenueResult,
           pendingPayments, pendingReturns, recentOrders] = await Promise.all([
      Order.countDocuments(),
      Product.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'user' }),
      Order.aggregate([
        { $match: { orderStatus: 'DELIVERED' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.countDocuments({
        'payment.status': 'PENDING',
        'payment.screenshotFile': { $exists: true, $ne: null },
      }),
      ReturnRequest.countDocuments({ status: 'PENDING' }),
      Order.find().sort({ createdAt: -1 }).limit(10),
    ]);
    res.json({
      success: true,
      stats: {
        totalOrders, totalProducts, totalUsers,
        revenue:        revenueResult[0]?.total || 0,
        pendingPayments, pendingReturns,
      },
      recentOrders,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── All orders ────────────────────────────────────────────────
router.get('/orders', protect, adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.paymentStatus) filter['payment.status'] = req.query.paymentStatus;
    if (req.query.status)        filter.orderStatus       = req.query.status;
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Single order ──────────────────────────────────────────────
router.get('/orders/:id', protect, adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update the order status update endpoint
router.put('/orders/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status, note, courierPartner, trackingNumber } = req.body;
    
    const update = { 
      orderStatus: status,
      $push: {
        'tracking.statusHistory': {
          status: status,
          note: note || '',
          updatedBy: req.user.name || req.user.email,
          timestamp: new Date()
        }
      }
    };
    
    // Add specific timestamps based on status
    if (status === 'SHIPPED') {
      update['tracking.shippedAt'] = new Date();
      if (courierPartner) update['tracking.courierPartner'] = courierPartner;
      if (trackingNumber) update['tracking.trackingNumber'] = trackingNumber;
    }
    
    if (status === 'OUT_FOR_DELIVERY') {
      update['tracking.outForDeliveryAt'] = new Date();
    }
    
    if (status === 'DELIVERED') {
      update['tracking.deliveredAt'] = new Date();
      update.deliveredAt = new Date();
    }

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    // Status messages for users
    const statusMessages = {
      VERIFIED: '✅ Payment verified! Your order is being prepared.',
      SHIPPED: '🚚 Your order has been shipped! Track your package in real-time.',
      OUT_FOR_DELIVERY: '🛵 Your order is out for delivery! Get ready to receive your package.',
      DELIVERED: '🎉 Your order has been delivered! Thank you for shopping with Street Kapda.',
      CANCELLED: '❌ Your order has been cancelled. Contact support if you need help.'
    };

    // Send real-time notification via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(order.userId.toString()).emit('order_status_update', {
        orderId: order._id,
        status: status,
        message: statusMessages[status],
        timestamp: new Date()
      });
    }

    // Send push notification
    await sendNotification(req.app, {
      userId: order.userId,
      title: getNotificationTitle(status),
      message: statusMessages[status],
      type: 'order',
      orderId: order._id.toString(),
    });

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Helper function for notification titles
function getNotificationTitle(status) {
  const titles = {
    VERIFIED: 'Order Verified ✅',
    SHIPPED: 'Order Shipped 🚚',
    OUT_FOR_DELIVERY: 'Out for Delivery 🛵',
    DELIVERED: 'Order Delivered 🎉',
    CANCELLED: 'Order Cancelled ❌'
  };
  return titles[status] || 'Order Update';
}

// Get order tracking details
router.get('/orders/:id/tracking', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    
    // Check authorization
    if (order.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    const tracking = {
      orderId: order._id,
      orderStatus: order.orderStatus,
      currentStatus: order.orderStatus,
      estimatedDelivery: order.tracking?.estimatedDelivery,
      shippedAt: order.tracking?.shippedAt,
      outForDeliveryAt: order.tracking?.outForDeliveryAt,
      deliveredAt: order.tracking?.deliveredAt || order.deliveredAt,
      courierPartner: order.tracking?.courierPartner,
      trackingNumber: order.tracking?.trackingNumber,
      statusHistory: order.tracking?.statusHistory || [],
      timeline: generateTimeline(order)
    };
    
    res.json({ success: true, tracking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Generate timeline based on order status
function generateTimeline(order) {
  const timeline = [
    { status: 'Order Placed', completed: true, timestamp: order.createdAt, icon: 'shopping_bag' }
  ];
  
  if (order.payment?.status === 'VERIFIED') {
    timeline.push({ status: 'Payment Verified', completed: true, timestamp: order.payment.verifiedAt, icon: 'verified' });
  } else if (order.orderStatus !== 'PENDING') {
    timeline.push({ status: 'Payment Verified', completed: true, timestamp: order.createdAt, icon: 'verified' });
  } else {
    timeline.push({ status: 'Payment Verified', completed: false, icon: 'verified' });
  }
  
  if (order.tracking?.shippedAt) {
    timeline.push({ status: 'Shipped', completed: true, timestamp: order.tracking.shippedAt, icon: 'local_shipping' });
  } else if (order.orderStatus === 'SHIPPED' || order.orderStatus === 'OUT_FOR_DELIVERY' || order.orderStatus === 'DELIVERED') {
    timeline.push({ status: 'Shipped', completed: true, timestamp: order.tracking?.shippedAt || order.updatedAt, icon: 'local_shipping' });
  } else {
    timeline.push({ status: 'Shipped', completed: false, icon: 'local_shipping' });
  }
  
  if (order.tracking?.outForDeliveryAt) {
    timeline.push({ status: 'Out for Delivery', completed: true, timestamp: order.tracking.outForDeliveryAt, icon: 'delivery_dining' });
  } else if (order.orderStatus === 'OUT_FOR_DELIVERY' || order.orderStatus === 'DELIVERED') {
    timeline.push({ status: 'Out for Delivery', completed: true, timestamp: order.tracking?.outForDeliveryAt || order.updatedAt, icon: 'delivery_dining' });
  } else if (order.orderStatus === 'SHIPPED') {
    timeline.push({ status: 'Out for Delivery', completed: false, icon: 'delivery_dining' });
  } else {
    timeline.push({ status: 'Out for Delivery', completed: false, icon: 'delivery_dining' });
  }
  
  if (order.tracking?.deliveredAt || order.deliveredAt) {
    timeline.push({ status: 'Delivered', completed: true, timestamp: order.tracking?.deliveredAt || order.deliveredAt, icon: 'check_circle' });
  } else if (order.orderStatus === 'DELIVERED') {
    timeline.push({ status: 'Delivered', completed: true, timestamp: order.tracking?.deliveredAt || order.updatedAt, icon: 'check_circle' });
  } else {
    timeline.push({ status: 'Delivered', completed: false, icon: 'check_circle' });
  }
  
  return timeline;
}

// Bulk update for shipping (admin)
router.post('/orders/bulk/ship', protect, adminOnly, async (req, res) => {
  try {
    const { orderIds, courierPartner, trackingNumber } = req.body;
    
    const updatedOrders = await Order.updateMany(
      { _id: { $in: orderIds }, orderStatus: 'VERIFIED' },
      { 
        $set: { 
          orderStatus: 'SHIPPED',
          'tracking.shippedAt': new Date(),
          'tracking.courierPartner': courierPartner,
          'tracking.trackingNumber': trackingNumber
        },
        $push: {
          'tracking.statusHistory': {
            status: 'SHIPPED',
            note: `Shipped via ${courierPartner}`,
            updatedBy: req.user.name || req.user.email,
            timestamp: new Date()
          }
        }
      }
    );
    
    // Send notifications for each order
    for (const orderId of orderIds) {
      const order = await Order.findById(orderId);
      if (order) {
        const io = req.app.get('io');
        if (io) {
          io.to(order.userId.toString()).emit('order_status_update', {
            orderId: order._id,
            status: 'SHIPPED',
            message: '🚚 Your order has been shipped!',
            timestamp: new Date()
          });
        }
        
        await sendNotification(req.app, {
          userId: order.userId,
          title: 'Order Shipped 🚚',
          message: `Your order has been shipped via ${courierPartner}`,
          type: 'order',
          orderId: order._id.toString(),
        });
      }
    }
    
    res.json({ success: true, updated: updatedOrders.modifiedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// ── Verify / Reject payment ───────────────────────────────────
router.put('/orders/:id/payment', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        'payment.status':     status,
        'payment.verifiedBy': req.user._id,
        'payment.verifiedAt': new Date(),
        ...(status === 'VERIFIED' && { orderStatus: 'VERIFIED' }),
      },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    if (status === 'REJECTED') {
      const user = await User.findById(order.userId);
      if (user && order.walletAmount > 0) {
        user.walletBalance += order.walletAmount;
        await user.save();
        await WalletTxn.create({
          userId:      order.userId,
          type:        'CREDIT',
          amount:      order.walletAmount,
          description: 'Refund – payment rejected',
          orderId:     order._id.toString(),
        });
      }
      await Order.findByIdAndUpdate(order._id, { orderStatus: 'CANCELLED' });
    }

    await sendNotification(req.app, {
      userId:  order.userId,
      title:   status === 'VERIFIED' ? 'Payment Verified! ✅' : 'Payment Rejected ❌',
      message: status === 'VERIFIED'
        ? 'Your payment has been verified. We are preparing your order!'
        : 'Your payment was rejected. Please re-upload or contact support.',
      type:    'payment',
      orderId: order._id.toString(),
    });

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── All products ──────────────────────────────────────────────
router.get('/products', protect, adminOnly, async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── All users ─────────────────────────────────────────────────
router.get('/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── All returns ───────────────────────────────────────────────
router.get('/returns', protect, adminOnly, async (req, res) => {
  try {
    const returns = await ReturnRequest.find().sort({ createdAt: -1 });
    res.json({ success: true, returns });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Approve / Reject return ───────────────────────────────────
router.put('/returns/:id', protect, adminOnly, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const r = await ReturnRequest.findByIdAndUpdate(req.params.id, { status, adminNote }, { new: true });

    if (status === 'APPROVED') {
      const order = await Order.findById(r.orderId);
      if (order) {
        const user = await User.findById(r.userId);
        if (user) {
          user.walletBalance += order.total;
          await user.save();
          await WalletTxn.create({
            userId:      r.userId,
            type:        'CREDIT',
            amount:      order.total,
            description: 'Return approved – refund',
            orderId:     order._id.toString(),
          });
        }
        await sendNotification(req.app, {
          userId:  r.userId,
          title:   'Return Approved ✅',
          message: `Your return for order #${order._id.toString().slice(-8).toUpperCase()} has been approved. ₹${order.total} added to your wallet.`,
          type:    'general',
          orderId: order._id.toString(),
        });
      }
    } else if (status === 'REJECTED') {
      await sendNotification(req.app, {
        userId:  r.userId,
        title:   'Return Request Update',
        message: adminNote ? `Return rejected: ${adminNote}` : 'Your return request was rejected. Contact support for details.',
        type:    'general',
      });
    }

    res.json({ success: true, returnRequest: r });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── All coupons ───────────────────────────────────────────────
router.get('/coupons', protect, adminOnly, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Create coupon ─────────────────────────────────────────────
router.post('/coupons', protect, adminOnly, async (req, res) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.status(201).json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Update coupon ─────────────────────────────────────────────
router.put('/coupons/:id', protect, adminOnly, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Delete coupon ─────────────────────────────────────────────
router.delete('/coupons/:id', protect, adminOnly, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// NOTIFICATIONS MANAGEMENT (ADMIN)
// ══════════════════════════════════════════════════════════════

// ── Send notification to a single user ───────────────────────
router.post('/notifications/send', protect, adminOnly, async (req, res) => {
  try {
    const { userId, title, message, type, orderId } = req.body;
    if (!userId || !title || !message)
      return res.status(400).json({ success: false, message: 'userId, title, message required' });

    const notif = await sendNotification(req.app, { userId, title, message, type, orderId });
    res.status(201).json({ success: true, notification: notif });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Broadcast notification to ALL users ──────────────────────
router.post('/notifications/broadcast', protect, adminOnly, async (req, res) => {
  try {
    const { title, message, type } = req.body;
    if (!title || !message)
      return res.status(400).json({ success: false, message: 'title and message required' });

    const results = await broadcastNotification(req.app, { title, message, type: type || 'promo' });
    res.status(201).json({
      success: true,
      message: `Notification sent to ${results.length} users`,
      count:   results.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get all notifications (admin view) ───────────────────────
router.get('/notifications', protect, adminOnly, async (req, res) => {
  try {
    const { userId, type, limit = 100 } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (type)   filter.type   = type;
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('userId', 'name phone email');
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Delete a notification ─────────────────────────────────────
router.delete('/notifications/:id', protect, adminOnly, async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// REVIEWS MANAGEMENT (ADMIN)
// ══════════════════════════════════════════════════════════════

router.get('/reviews', protect, adminOnly, async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 }).limit(100);
    const reviewsWithProducts = await Promise.all(
      reviews.map(async (review) => {
        const product = await Product.findById(review.productId);
        return { ...review.toObject(), productName: product?.name || 'Unknown Product' };
      })
    );
    res.json({ success: true, reviews: reviewsWithProducts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/reviews/:id', protect, adminOnly, async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isApproved: req.body.isApproved },
      { new: true }
    );
    res.json({ success: true, review });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/reviews/:id', protect, adminOnly, async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Review deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── QR Upload (alias kept for backward compat) ───────────────
const upload = require('../middleware/upload');
router.post('/settings/qr', protect, adminOnly, upload.single('qr'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'QR image is required' });
    await Settings.findOneAndUpdate(
      { key: 'qr_code' },
      { key: 'qr_code', value: req.file.filename },
      { upsert: true, new: true }
    );
    res.json({ success: true, qrFile: req.file.filename, message: 'QR code uploaded successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
