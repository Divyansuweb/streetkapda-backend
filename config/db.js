const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

let gfsBucket = null;
let retryCount = 0;
const MAX_RETRIES = 5;

const connectDB = async (app) => {
  try {
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    
    logger.info('✅ MongoDB Connected successfully');
    console.log('✅ MongoDB Connected');

    const db = mongoose.connection.db;
    gfsBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'uploads' });
    app.set('gfsBucket', gfsBucket);
    
    // Reset retry count on successful connection
    retryCount = 0;
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected, attempting to reconnect...');
      setTimeout(connectDB, 5000);
    });

    // Run seed only in development or if no admin exists
    if (process.env.NODE_ENV !== 'production') {
      await require('../utils/seed')(mongoose.connection);
    } else {
      // In production, only seed if absolutely necessary
      const { User } = require('../models');
      const adminExists = await User.findOne({ role: 'admin' });
      if (!adminExists) {
        await require('../utils/seed')(mongoose.connection);
      }
    }
    
    return true;
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    console.error('❌ MongoDB Connection Error:', error.message);
    
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      logger.info(`Retrying connection in ${delay}ms (Attempt ${retryCount}/${MAX_RETRIES})`);
      setTimeout(() => connectDB(app), delay);
    } else {
      logger.error('Max retries reached. Exiting...');
      process.exit(1);
    }
  }
};

const getGridFSBucket = () => gfsBucket;

module.exports = { connectDB, getGridFSBucket };