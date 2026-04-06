const router = require('express').Router();
const { Banner } = require('../models');
const { protect, adminOnly } = require('../middleware/auth');
const upload = require('../middleware/upload');

// ── Get all active banners (public) ─────────────────────────
router.get('/', async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort({ order: 1 });
    res.json({ success: true, banners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get all banners for admin ────────────────────────────────
router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try {
    const banners = await Banner.find().sort({ order: 1 });
    res.json({ success: true, banners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Create banner (admin) ────────────────────────────────────
router.post('/', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const bannerData = {
      title: req.body.title,
      subtitle: req.body.subtitle || '',
      buttonText: req.body.buttonText || 'Shop Now',
      buttonLink: req.body.buttonLink || '',
      order: parseInt(req.body.order) || 0,
      isActive: req.body.isActive === 'true',
      backgroundColor: req.body.backgroundColor || '#1A2C3E',
    };
    
    if (req.file) {
      bannerData.image = req.file.filename;
    }
    
    const banner = await Banner.create(bannerData);
    res.status(201).json({ success: true, banner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Update banner (admin) ────────────────────────────────────
router.put('/:id', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }
    
    banner.title = req.body.title || banner.title;
    banner.subtitle = req.body.subtitle ?? banner.subtitle;
    banner.buttonText = req.body.buttonText || banner.buttonText;
    banner.buttonLink = req.body.buttonLink ?? banner.buttonLink;
    banner.order = parseInt(req.body.order) ?? banner.order;
    banner.isActive = req.body.isActive === 'true';
    banner.backgroundColor = req.body.backgroundColor || banner.backgroundColor;
    
    if (req.file) {
      banner.image = req.file.filename;
    }
    
    await banner.save();
    res.json({ success: true, banner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Delete banner (admin) ────────────────────────────────────
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Banner deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;