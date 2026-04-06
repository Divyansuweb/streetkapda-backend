const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

let gfsBucket = null;

const connectDB = async (app) => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB Connected');

  const db = mongoose.connection.db;
  gfsBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'uploads' });
  app.set('gfsBucket', gfsBucket);
  console.log('✅ GridFS Bucket initialized');

  // Run seed after connection
  await require('../utils/seed')(mongoose.connection);
};

module.exports = connectDB;
