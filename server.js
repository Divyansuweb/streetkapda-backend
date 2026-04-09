require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { initFirebase } = require('./config/firebase');
const { logger, morganStream } = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { protect, adminOnly } = require('./middleware/auth');
const {
  securityHeaders,
  sanitizeInput,
  xssProtection,
  compress,
  requestLogger,
  blockSuspicious,
  configureCors
} = require('./middleware/security');
const { 
  generalLimiter, 
  authLimiter, 
  publicLimiter,
  uploadLimiter 
} = require('./config/rateLimiter');
const morgan = require('morgan');

// Import routes
const {
  addressRouter, couponRouter, walletRouter,
  wishlistRouter, bargainRouter, returnRouter,
} = require('./routes/misc');

const app = express();
const httpServer = createServer(app);

// Initialize Firebase (only for notifications)
initFirebase();

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
});

// ── Middleware (order matters!) ─────────────────────────────────
// Security headers
app.use(securityHeaders);

// CORS
app.use(cors(configureCors()));
app.options('*', cors(configureCors()));

// Request logging
app.use(morgan('combined', { stream: morganStream }));
app.use(requestLogger);

// Compression
app.use(compress);

// Body parsing with limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security sanitization
app.use(blockSuspicious);
app.use(sanitizeInput);
app.use(xssProtection);

// ── Rate Limiting (Applied per route for better control) ────────
// Apply different rate limits based on route type
app.use('/api/auth', authLimiter);           // Stricter for authentication
app.use('/api/products', publicLimiter);     // Permissive for product views
app.use('/api/banners', publicLimiter);      // Permissive for banners
app.use('/api/settings', publicLimiter);     // Permissive for settings
app.use('/api/file', publicLimiter);         // Permissive for file access
app.use('/api/admin/upload', uploadLimiter); // Stricter for uploads
app.use('/api', generalLimiter);             // Default for all other routes

// Attach Socket.IO to app
app.set('io', io);

// ── Database Connection ────────────────────────────────────────
connectDB(app).catch((err) => {
  logger.error('MongoDB Error:', err);
  process.exit(1);
});

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/notifications', require('./routes/fcm'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/addresses', addressRouter);
app.use('/api/coupons', couponRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/bargain', bargainRouter);
app.use('/api/returns', returnRouter);
app.use('/api/file', require('./routes/files'));
app.use('/api/payments', require('./routes/payment'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/banners', require('./routes/banners'));

// Debug endpoint to check rate limit status (admin only)
app.get('/api/debug/rate-limits', protect, adminOnly, (req, res) => {
  res.json({
    success: true,
    message: 'Rate limit configuration',
    limits: {
      general: '300 per minute',
      auth: '20 per 15 minutes',
      public: '500 per minute',
      upload: '200 per hour'
    },
    currentTime: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

app.get('/', (req, res) =>
  res.json({ 
    message: 'Street Kapda API v4.0', 
    status: 'running',
    environment: process.env.NODE_ENV,
  })
);

// ── 404 and Error Handlers ─────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Socket.IO Events ───────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join', (userId) => {
    if (userId && typeof userId === 'string') {
      socket.join(userId);
      logger.debug(`User ${userId} joined room`);
    }
  });

  socket.on('leave', (userId) => {
    if (userId && typeof userId === 'string') {
      socket.leave(userId);
      logger.debug(`User ${userId} left room`);
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// ── Graceful Shutdown ──────────────────────────────────────────
const gracefulShutdown = () => {
  logger.info('Received shutdown signal, closing gracefully...');
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ── Start Server ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
// const HOST = process.env.HOST || '192.168.1.13';
const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`📡 API: http://${HOST}:${PORT}/api`);
  logger.info(`🖼️  Files: http://${HOST}:${PORT}/api/file/<filename>`);
});