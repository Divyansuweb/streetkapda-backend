
// Simple logger that works without winston
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
};

// Create a stream for morgan
const morganStream = {
  write: (message) => {
    console.log(message.trim());
  }
};

module.exports = { logger, morganStream };


// // const winston = require('winston');
// // const DailyRotateFile = require('winston-daily-rotate-file');
// // const path = require('path');

// // // Define log format
// // const logFormat = winston.format.combine(
// //   winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
// //   winston.format.errors({ stack: true }),
// //   winston.format.splat(),
// //   winston.format.json(),
// //   winston.format.printf(({ timestamp, level, message, ...meta }) => {
// //     return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
// //   })
// // );

// // // Configure transports
// // const transports = [];

// // // Console transport (always on)
// // transports.push(
// //   new winston.transports.Console({
// //     format: winston.format.combine(
// //       winston.format.colorize(),
// //       winston.format.simple()
// //     ),
// //     level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
// //   })
// // );

// // // File transport with rotation (production only)
// // if (process.env.NODE_ENV === 'production') {
// //   const logDir = path.join(__dirname, '../logs');
  
// //   // Error log rotation
// //   transports.push(
// //     new DailyRotateFile({
// //       filename: path.join(logDir, 'error-%DATE%.log'),
// //       datePattern: 'YYYY-MM-DD',
// //       level: 'error',
// //       maxSize: '20m',
// //       maxFiles: '30d',
// //       format: logFormat
// //     })
// //   );
  
// //   // Combined log rotation
// //   transports.push(
// //     new DailyRotateFile({
// //       filename: path.join(logDir, 'combined-%DATE%.log'),
// //       datePattern: 'YYYY-MM-DD',
// //       maxSize: '20m',
// //       maxFiles: '30d',
// //       format: logFormat
// //     })
// //   );
// // }

// // // Create logger
// // const logger = winston.createLogger({
// //   level: process.env.LOG_LEVEL || 'info',
// //   format: logFormat,
// //   transports,
// //   exitOnError: false
// // });

// // // Create a stream for morgan (HTTP logging)
// // const morganStream = {
// //   write: (message) => {
// //     logger.info(message.trim());
// //   }
// // };

// // module.exports = { logger, morganStream };




// const winston = require('winston');
// const DailyRotateFile = require('winston-daily-rotate-file');
// const path = require('path');

// // Define log format
// const logFormat = winston.format.combine(
//   winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
//   winston.format.errors({ stack: true }),
//   winston.format.splat(),
//   winston.format.json(),
//   winston.format.printf(({ timestamp, level, message, ...meta }) => {
//     return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
//   })
// );

// // Configure transports
// const transports = [];

// // Console transport (always on)
// transports.push(
//   new winston.transports.Console({
//     format: winston.format.combine(
//       winston.format.colorize(),
//       winston.format.simple()
//     ),
//     level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
//   })
// );

// // File transport with rotation (production only)
// if (process.env.NODE_ENV === 'production') {
//   const logDir = path.join(__dirname, '../logs');
  
//   // Error log rotation
//   transports.push(
//     new DailyRotateFile({
//       filename: path.join(logDir, 'error-%DATE%.log'),
//       datePattern: 'YYYY-MM-DD',
//       level: 'error',
//       maxSize: '20m',
//       maxFiles: '30d',
//       format: logFormat
//     })
//   );
  
//   // Combined log rotation
//   transports.push(
//     new DailyRotateFile({
//       filename: path.join(logDir, 'combined-%DATE%.log'),
//       datePattern: 'YYYY-MM-DD',
//       maxSize: '20m',
//       maxFiles: '30d',
//       format: logFormat
//     })
//   );
// }

// // Create logger
// const logger = winston.createLogger({
//   level: process.env.LOG_LEVEL || 'info',
//   format: logFormat,
//   transports,
//   exitOnError: false
// });

// // Create a stream for morgan (HTTP logging)
// const morganStream = {
//   write: (message) => {
//     logger.info(message.trim());
//   }
// };

// module.exports = { logger, morganStream };