const router   = require('express').Router();
const path     = require('path');
const mongoose = require('mongoose');

const mimeMap = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.pdf':  'application/pdf',
};

router.get('/:filename', async (req, res) => {
  try {
    const gfsBucket = req.app.get('gfsBucket');
    let filename = req.params.filename;

    try { filename = decodeURIComponent(filename); } catch (_) {}

    if (!gfsBucket)
      return res.status(503).json({ message: 'Storage not ready' });

    // Try by filename first
    let files = await gfsBucket.find({ filename }).toArray();

    // Fallback: try ObjectId
    if (!files || files.length === 0) {
      try {
        if (mongoose.Types.ObjectId.isValid(filename)) {
          files = await gfsBucket.find({ _id: new mongoose.Types.ObjectId(filename) }).toArray();
        }
      } catch (_) {}
    }

    if (!files || files.length === 0)
      return res.status(404).json({ message: `File not found: ${filename}` });

    const file = files[0];
    const ext  = path.extname(filename).toLowerCase();
    const mime = mimeMap[ext] || file.contentType || 'image/jpeg';

    res.setHeader('Content-Type',        mime);
    res.setHeader('Content-Length',      file.length);
    res.setHeader('Cache-Control',       'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Disposition', 'inline');

    const stream = gfsBucket.openDownloadStreamByName(filename);
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ message: 'Stream error' });
    });
    stream.pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: err.message });
  }
});

router.options('/:filename', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).send();
});

module.exports = router;
