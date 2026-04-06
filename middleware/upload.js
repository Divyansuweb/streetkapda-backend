const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
    options: { useNewUrlParser: true, useUnifiedTopology: true },
    file: (req, file) =>
      new Promise((resolve) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `${uuidv4()}${ext}`;
        let contentType = file.mimetype;
        if (!contentType || contentType === 'application/octet-stream') {
          contentType = mimeMap[ext] || 'image/jpeg';
        }
        resolve({ bucketName: 'uploads', filename, contentType });
      }),
  });

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|gif/;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  allowed.test(ext) ? cb(null, true) : cb(new Error('Only image files are allowed'), false);
};

const uploadMiddleware = (fieldName, maxCount) => (req, res, next) => {
  const storage = getStorage();
  const uploader = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
  const handler = maxCount > 1
    ? uploader.array(fieldName, maxCount)
    : uploader.single(fieldName);

  handler(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

uploadMiddleware.array  = (field, max) => uploadMiddleware(field, max || 10);
uploadMiddleware.single = (field) => uploadMiddleware(field, 1);

module.exports = uploadMiddleware;
