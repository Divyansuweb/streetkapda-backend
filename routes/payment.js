
const router = require('express').Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { Order } = require('../models');
const { protect } = require('../middleware/auth');
const { sendNotification } = require('../utils/notification');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Razorpay order
router.post('/create-order', protect, async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    
    const options = {
      amount: Math.round(amount * 100), // Amount in paise
      currency: 'INR',
      receipt: orderId,
      payment_capture: 1,
    };
    
    const order = await razorpay.orders.create(options);
    
    res.json({
      success: true,
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (err) {
    console.error('Razorpay order creation error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Verify payment signature
router.post('/verify-payment', protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    
    // Find the order first
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    if (expectedSignature === razorpay_signature) {
      // Update order status to VERIFIED
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        {
          'payment.status': 'VERIFIED',
          'payment.paymentId': razorpay_payment_id,
          'payment.razorpayOrderId': razorpay_order_id,
          'payment.signature': razorpay_signature,
          'payment.verifiedAt': new Date(),
          orderStatus: 'VERIFIED',
        },
        { new: true }
      );
      
      // Send notification to user
      await sendNotification(req.app, {
        userId: order.userId,
        title: 'Payment Successful! ✅',
        message: `Your payment of ₹${order.total} has been verified. Order is being processed.`,
        type: 'payment',
        orderId: order._id.toString(),
      });
      
      res.json({ 
        success: true, 
        message: 'Payment verified successfully',
        order: updatedOrder
      });
    } else {
      // Update order status to REJECTED
      await Order.findByIdAndUpdate(orderId, {
        'payment.status': 'REJECTED',
        orderStatus: 'CANCELLED',
      });
      
      res.status(400).json({ 
        success: false, 
        message: 'Invalid signature - Payment verification failed' 
      });
    }
  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get payment status for an order
router.get('/status/:orderId', protect, async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    res.json({
      success: true,
      paymentStatus: order.payment.status,
      orderStatus: order.orderStatus,
      paymentId: order.payment.paymentId,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;