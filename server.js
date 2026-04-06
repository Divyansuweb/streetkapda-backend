require('dotenv').config();
const express          = require('express');
const { createServer } = require('http');
const { Server }       = require('socket.io');
const cors             = require('cors');
const connectDB        = require('./config/db');

const {
  addressRouter, couponRouter, walletRouter,
  wishlistRouter, bargainRouter, returnRouter,
} = require('./routes/misc');

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin:          '*',
  methods:         ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders:  ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders:  ['Content-Type', 'Content-Length'],
  credentials:     false,
}));
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.set('io', io);

// ── Database ──────────────────────────────────────────────────
connectDB(app).catch((err) => {
  console.error('❌ MongoDB Error:', err);
  process.exit(1);
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/products',      require('./routes/products'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
// Add this line with other routes (after your existing routes)
app.use('/api/notifications', require('./routes/fcm')); // ADD THIS LINE
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/addresses',     addressRouter);
app.use('/api/coupons',       couponRouter);
app.use('/api/wallet',        walletRouter);
app.use('/api/wishlist',      wishlistRouter);
app.use('/api/bargain',       bargainRouter);
app.use('/api/returns',       returnRouter);
app.use('/api/file',          require('./routes/files'));
// Add this with other routes
app.use('/api/payments', require('./routes/payment'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/banners', require('./routes/banners'));



// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) =>
  res.json({ message: 'Street Kapda API v4.0', status: 'running' })
);

// ── Socket.IO ─────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`👤 User ${userId} joined room`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 API → http://192.168.1.13:${PORT}/api`);
  console.log(`🖼  Files → http://192.168.1.13:${PORT}/api/file/<filename>`);
});
