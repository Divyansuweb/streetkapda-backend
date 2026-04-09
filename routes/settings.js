
const router = require('express').Router();
const { Settings } = require('../models');
const { protect, adminOnly } = require('../middleware/auth');
const upload = require('../middleware/upload');

// ── GET single setting by key (public) ───────────────────────
router.get('/key/:key', async (req, res) => {
  try {
    const s = await Settings.findOne({ key: req.params.key });
    res.json({ success: true, key: req.params.key, value: s?.value ?? null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET COD cities (public) ───────────────────────────────────
router.get('/cod-cities', async (req, res) => {
  try {
    const s = await Settings.findOne({ key: 'cod_cities' });
    const cities = s?.value || ['Ahmedabad'];
    res.json({ success: true, cities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET QR code (public) ──────────────────────────────────────
router.get('/qr', async (req, res) => {
  try {
    const s = await Settings.findOne({ key: 'qr_code' });
    res.json({ success: true, qrFile: s?.value || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET app content pages (public) ───────────────────────────
router.get('/page/:key', async (req, res) => {
  try {
    const allowed = ['privacy_policy', 'terms_conditions', 'about_app', 'refund_policy'];
    if (!allowed.includes(req.params.key))
      return res.status(403).json({ success: false, message: 'Not allowed' });
    const s = await Settings.findOne({ key: req.params.key });
    res.json({ success: true, content: s?.value || '', label: s?.label || '' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET delivery / app config (public) ───────────────────────
router.get('/config', async (req, res) => {
  try {
    const keys = ['delivery_charge', 'free_delivery_min', 'return_window_days',
                  'referral_reward', 'app_version', 'contact_email',
                  'contact_phone', 'social_links'];
    const docs = await Settings.find({ key: { $in: keys } });
    const config = {};
    docs.forEach((d) => { config[d.key] = d.value; });
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Pincode delivery check (public) ──────────────────────────
router.get('/pincode/:pincode', async (req, res) => {
  try {
    const s = await Settings.findOne({ key: 'serviceable_pincodes' });
    const pincodes = s?.value || [];
    if (pincodes.length === 0)
      return res.json({ success: true, available: true, message: 'Delivery available!' });
    const available = pincodes.includes(req.params.pincode);
    res.json({
      success: true,
      available,
      message: available ? 'Delivery available!' : 'Delivery not available in this area yet.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET all settings (admin) ──────────────────────────────────
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const settings = await Settings.find().sort({ group: 1, key: 1 });
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── UPDATE a setting by key (admin) ──────────────────────────
router.put('/key/:key', protect, adminOnly, async (req, res) => {
  try {
    const { value } = req.body;
    const s = await Settings.findOneAndUpdate(
      { key: req.params.key },
      { value },
      { upsert: true, new: true }
    );
    res.json({ success: true, setting: s });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Upload QR code (admin) ────────────────────────────────────
router.post('/qr', protect, adminOnly, upload.single('qr'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'QR image is required' });
    await Settings.findOneAndUpdate(
      { key: 'qr_code' },
      { key: 'qr_code', value: req.file.filename },
      { upsert: true, new: true }
    );
    res.json({ success: true, qrFile: req.file.filename, message: 'QR code uploaded successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;