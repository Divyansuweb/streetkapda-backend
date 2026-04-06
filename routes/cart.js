const router = require('express').Router();
const { Cart, Product } = require('../models');
const { protect } = require('../middleware/auth');

// Get user's cart
router.get('/', protect, async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) {
      cart = { items: [] };
    }
    res.json({ success: true, cart: cart.items || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add item to cart
router.post('/add', protect, async (req, res) => {
  try {
    const { productId, selectedSize, selectedColor, quantity } = req.body;
    
    // Get product details
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    let cart = await Cart.findOne({ userId: req.user._id });
    
    if (!cart) {
      cart = new Cart({ userId: req.user._id, items: [] });
    }
    
    // Check if item already exists
    const existingItemIndex = cart.items.findIndex(
      item => item.productId === productId && 
              item.selectedSize === selectedSize && 
              item.selectedColor === selectedColor
    );
    
    if (existingItemIndex > -1) {
      // Update quantity
      cart.items[existingItemIndex].quantity += quantity || 1;
    } else {
      // Add new item
      cart.items.push({
        productId: product.id,
        productName: product.name,
        productPrice: product.price,
        productDiscountPrice: product.discountPrice,
        productImage: product.images[0] || '',
        selectedSize: selectedSize,
        selectedColor: selectedColor || '',
        quantity: quantity || 1,
        productStock: product.stock,
        productCategory: product.category,
        productSizes: product.sizes,
        productColors: product.colors,
      });
    }
    
    cart.updatedAt = new Date();
    await cart.save();
    
    res.json({ success: true, cart: cart.items });
  } catch (err) {
    console.error('Add to cart error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update item quantity
router.put('/update/:productId', protect, async (req, res) => {
  try {
    const { productId } = req.params;
    const { selectedSize, selectedColor, quantity } = req.body;
    
    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    
    const itemIndex = cart.items.findIndex(
      item => item.productId === productId && 
              item.selectedSize === selectedSize && 
              item.selectedColor === selectedColor
    );
    
    if (itemIndex > -1) {
      if (quantity <= 0) {
        cart.items.splice(itemIndex, 1);
      } else {
        cart.items[itemIndex].quantity = quantity;
      }
      cart.updatedAt = new Date();
      await cart.save();
    }
    
    res.json({ success: true, cart: cart.items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Remove item from cart
router.delete('/remove/:productId', protect, async (req, res) => {
  try {
    const { productId } = req.params;
    const { selectedSize, selectedColor } = req.body;
    
    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    
    const itemIndex = cart.items.findIndex(
      item => item.productId === productId && 
              item.selectedSize === selectedSize && 
              item.selectedColor === selectedColor
    );
    
    if (itemIndex > -1) {
      cart.items.splice(itemIndex, 1);
      cart.updatedAt = new Date();
      await cart.save();
    }
    
    res.json({ success: true, cart: cart.items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Clear entire cart
router.delete('/clear', protect, async (req, res) => {
  try {
    await Cart.findOneAndDelete({ userId: req.user._id });
    res.json({ success: true, message: 'Cart cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;