
const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

// General API rate limiter - More permissive for production
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute (reduced from 15 minutes)
  max: 300, // 300 requests per minute (increased from 100)
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  },
  skip: (req) => {
    // Skip rate limiting for health checks and static files
    return req.path === '/health' || req.path === '/';
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.method} ${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later.'
    });
  }
});

// Strict limiter for auth routes (login, register, forgot-password)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes (increased from 10)
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  keyGenerator: (req) => {
    // Use email as key for better rate limiting
    return req.body.email || req.ip;
  }
});

// OTP limiter
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 OTP requests per hour (increased from 5)
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again after an hour.'
  },
});

// Order creation limiter
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 orders per hour (increased from 20)
  message: {
    success: false,
    message: 'Too many orders created. Please try again later.'
  },
});

// Upload limiter - More permissive for admin
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // 200 uploads per hour (increased from 50)
  message: {
    success: false,
    message: 'Too many uploads. Please try again later.'
  },
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user?.role === 'admin';
  }
});

// Public routes limiter (products, banners, etc.) - Very permissive
const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // 500 requests per minute
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many requests, please slow down.'
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  otpLimiter,
  orderLimiter,
  uploadLimiter,
  publicLimiter,
};