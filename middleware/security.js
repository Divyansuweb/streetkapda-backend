const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const compression = require('compression');
const { logger } = require('../utils/logger');

// Configure helmet with proper settings
const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginEmbedderPolicy: { policy: "require-corp" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Sanitize user input
const sanitizeInput = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn(`Attempted NoSQL injection detected: ${key}`);
  }
});

// XSS protection
const xssProtection = xss();

// Compression for responses
const compress = compression();

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel](`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?._id
    });
  });
  
  next();
};

// Block suspicious requests
const blockSuspicious = (req, res, next) => {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /eval\(/i,
    /exec\(/i,
    /system\(/i,
    /\.\.\/\.\./,
    /\\\.\\\./
  ];
  
  const checkString = (str) => {
    if (!str) return false;
    return suspiciousPatterns.some(pattern => pattern.test(str));
  };
  
  // Check URL
  if (checkString(req.url)) {
    logger.warn(`Suspicious URL blocked: ${req.url} from IP: ${req.ip}`);
    return res.status(403).json({ success: false, message: 'Invalid request' });
  }
  
  // Check query parameters
  for (const key in req.query) {
    if (checkString(req.query[key])) {
      logger.warn(`Suspicious query param blocked: ${key}=${req.query[key]}`);
      return res.status(403).json({ success: false, message: 'Invalid request' });
    }
  }
  
  next();
};

// CORS configuration
const configureCors = () => {
  const allowedOrigins = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:52849'];
  
  return {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, etc)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Total-Count'],
    credentials: true,
    maxAge: 86400 // 24 hours
  };
};

module.exports = {
  securityHeaders,
  sanitizeInput,
  xssProtection,
  compress,
  requestLogger,
  blockSuspicious,
  configureCors
};