const router   = require('express').Router();
const mongoose = require('mongoose');
const { Product, Review } = require('../models');
const { protect, adminOnly } = require('../middleware/auth');
const upload   = require('../middleware/upload');

// ── Helpers ──────────────────────────────────────────────────
const parseArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value.split(',').map((s) => s.trim()).filter(Boolean);
};

// ── GET all products (with filters) ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, minPrice, maxPrice, sizes, sort, featured, limit } = req.query;
    const filter = { isActive: true };
    if (category)             filter.category = category;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (sizes)          filter.sizes = { $in: sizes.split(',') };
    if (featured === 'true') filter.isFeatured = true;

    let sortObj = { createdAt: -1 };
    if (sort === 'price_asc')  sortObj = { price: 1 };
    else if (sort === 'price_desc') sortObj = { price: -1 };
    else if (sort === 'popular')    sortObj = { sold: -1 };
    else if (sort === 'discount')   sortObj = { discountPrice: 1 };

    const products = await Product.find(filter)
      .sort(sortObj)
      .limit(limit ? Number(limit) : 50);

    res.json({ success: true, products, total: products.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── SEARCH products ───────────────────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, products: [] });
    const products = await Product.find({
      isActive: true,
      $or: [
        { name:        { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { category:    { $regex: q, $options: 'i' } },
      ],
    }).limit(20);
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET single product ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET similar products ──────────────────────────────────────
router.get('/:id/similar', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    const similar = await Product.find({
      _id:      { $ne: product._id },
      category: product.category,
      isActive: true,
    }).limit(8).sort({ sold: -1 });
    res.json({ success: true, products: similar });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET reviews for a product ─────────────────────────────────
router.get('/:id/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ productId: req.params.id, isApproved: true })
      .sort({ createdAt: -1 })
      .limit(20);

    const avgResult = await Review.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(req.params.id), isApproved: true } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      reviews,
      stats: {
        averageRating: avgResult[0]?.avgRating || 0,
        totalReviews:  avgResult[0]?.count || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST add review ───────────────────────────────────────────
router.post('/:id/reviews', protect, upload.single('reviewImage'), async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const existing = await Review.findOne({ productId: req.params.id, userId: req.user._id });
    if (existing)
      return res.status(400).json({ success: false, message: 'You have already reviewed this product' });

    const reviewData = {
      productId: req.params.id,
      userId:    req.user._id,
      userName:  req.user.name,
      rating:    Number(rating),
      comment:   comment.trim(),
    };
    if (req.file) reviewData.reviewImage = req.file.filename;

    const review     = await Review.create(reviewData);
    const allReviews = await Review.find({ productId: req.params.id, isApproved: true });
    const avgRating  = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await Product.findByIdAndUpdate(req.params.id, {
      rating:      avgRating,
      reviewCount: allReviews.length,
    });

    res.status(201).json({ success: true, review });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── CREATE product (admin) ────────────────────────────────────
router.post('/', protect, adminOnly, upload.array('images', 5), async (req, res) => {
  try {
    const newImageFilenames = req.files ? req.files.map((f) => f.filename) : [];
    const parsedSizes  = parseArray(req.body.sizes);
    const parsedColors = parseArray(req.body.colors);
    const existingImgs = parseArray(req.body.existingImages);
    const allImages    = [...existingImgs, ...newImageFilenames];

    const product = await Product.create({
      name:          req.body.name,
      description:   req.body.description,
      price:         Number(req.body.price),
      discountPrice: req.body.discountPrice ? Number(req.body.discountPrice) : undefined,
      category:      req.body.category,
      sizes:         parsedSizes,
      colors:        parsedColors,
      stock:         Number(req.body.stock || 0),
      isFeatured:    req.body.isFeatured === 'true' || req.body.isFeatured === true,
      comboOffer:    req.body.comboOffer || undefined,
      images:        allImages,
    });

    res.status(201).json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── UPDATE product (admin) ────────────────────────────────────
router.put('/:id', protect, adminOnly, upload.array('images', 5), async (req, res) => {
  try {
    const newImageFilenames = req.files ? req.files.map((f) => f.filename) : [];
    const parsedSizes  = parseArray(req.body.sizes);
    const parsedColors = parseArray(req.body.colors);
    const existingImgs = parseArray(req.body.existingImages);
    const allImages    = [...existingImgs, ...newImageFilenames];

    const updateData = {
      name:          req.body.name,
      description:   req.body.description,
      price:         req.body.price         ? Number(req.body.price)         : undefined,
      discountPrice: req.body.discountPrice ? Number(req.body.discountPrice) : undefined,
      category:      req.body.category,
      stock:         req.body.stock         ? Number(req.body.stock)         : undefined,
      isFeatured:    req.body.isFeatured === 'true' || req.body.isFeatured === true,
      comboOffer:    req.body.comboOffer || undefined,
      ...(parsedSizes.length > 0  && { sizes:  parsedSizes }),
      ...(parsedColors.length > 0 && { colors: parsedColors }),
      ...(allImages.length > 0    && { images: allImages }),
    };

    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE product (admin) ────────────────────────────────────
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
