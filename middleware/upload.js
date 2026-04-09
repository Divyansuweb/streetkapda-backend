
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

// Allow more MIME types including application/octet-stream
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 
  'image/jpg', 
  'image/png', 
  'image/webp', 
  'image/gif',
  'application/octet-stream' // Allow this for Flutter app
];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default

const mimeMap = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const getStorage = () =>
  new GridFsStorage({
    url: process.env.MONGODB_URI,
    options: { 
      useNewUrlParser: true, 
      useUnifiedTopology: true 
    },
    file: (req, file) =>
      new Promise((resolve, reject) => {
        const ext = path.extname(file.originalname).toLowerCase();
        
        // Validate file extension
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          logger.warn(`File upload rejected: Invalid extension ${ext}`);
          return reject(new Error('File type not allowed. Only images (JPEG, PNG, WEBP, GIF) are allowed.'));
        }
        
        const filename = `${uuidv4()}${ext}`;
        
        // Determine content type - handle application/octet-stream
        let contentType = file.mimetype;
        if (contentType === 'application/octet-stream' || !contentType) {
          contentType = mimeMap[ext] || 'image/jpeg';
        }
        
        logger.debug(`File upload accepted: ${file.originalname} -> ${filename} (${contentType})`);
        
        resolve({ 
          bucketName: 'uploads', 
          filename, 
          contentType,
          metadata: {
            originalName: file.originalname,
            uploadedBy: req.user?._id || 'anonymous',
            uploadTime: new Date(),
            size: file.size
          }
        });
      }),
  });

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  // Check extension first
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    logger.warn(`File upload rejected: ${file.originalname} - invalid extension ${ext} by user ${req.user?._id}`);
    cb(new Error('Only image files are allowed (JPEG, PNG, WEBP, GIF)'), false);
  }
};

const uploadMiddleware = (fieldName, maxCount) => (req, res, next) => {
  const storage = getStorage();
  const uploader = multer({ 
    storage, 
    fileFilter, 
    limits: { 
      fileSize: MAX_FILE_SIZE,
      files: maxCount || 10
    } 
  });
  
  const handler = maxCount > 1
    ? uploader.array(fieldName, maxCount)
    : uploader.single(fieldName);

  handler(req, res, (err) => {
    if (err) {
      logger.error('Upload error:', err.message);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          success: false, 
          message: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
        });
      }
      
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ 
          success: false, 
          message: `Too many files. Max: ${maxCount}` 
        });
      }
      
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

uploadMiddleware.array = (field, max) => uploadMiddleware(field, max || 10);
uploadMiddleware.single = (field) => uploadMiddleware(field, 1);

module.exports = uploadMiddleware;