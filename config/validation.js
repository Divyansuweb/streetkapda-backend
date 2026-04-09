const Joi = require('joi');

// User validation schemas
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^[0-9]{10}$/).required(),
  password: Joi.string().min(6).max(50).required(),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
  referralCode: Joi.string().optional().allow('')
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required()
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().min(6).max(50).required(),
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).max(50).required()
});

// Product validation
const productSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  description: Joi.string().min(10).max(5000).required(),
  price: Joi.number().positive().required(),
  discountPrice: Joi.number().positive().optional(),
  category: Joi.string().required(),
  sizes: Joi.array().items(Joi.string()),
  colors: Joi.array().items(Joi.string()),
  stock: Joi.number().integer().min(0).default(0),
  isFeatured: Joi.boolean().default(false),
  comboOffer: Joi.string().optional().allow('')
});

// Order validation
const orderSchema = Joi.object({
  items: Joi.array().min(1).required(),
  addressId: Joi.string().required(),
  subtotal: Joi.number().positive().required(),
  deliveryCharge: Joi.number().min(0).default(0),
  couponCode: Joi.string().optional().allow(''),
  couponDiscount: Joi.number().min(0).default(0),
  walletAmount: Joi.number().min(0).default(0),
  total: Joi.number().positive().required(),
  paymentMethod: Joi.string().valid('RAZORPAY', 'COD').required()
});

// Address validation
const addressSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  phone: Joi.string().pattern(/^[0-9]{10}$/).required(),
  line1: Joi.string().min(5).max(200).required(),
  line2: Joi.string().max(200).allow(''),
  city: Joi.string().min(2).max(50).required(),
  state: Joi.string().min(2).max(50).required(),
  pincode: Joi.string().pattern(/^[0-9]{6}$/).required(),
  isDefault: Joi.boolean().default(false)
});

// Cart validation
const cartAddSchema = Joi.object({
  productId: Joi.string().required(),
  selectedSize: Joi.string().required(),
  selectedColor: Joi.string().optional().allow(''),
  quantity: Joi.number().integer().min(1).max(10).default(1)
});

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
        field: error.details[0].path[0]
      });
    }
    next();
  };
};

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  productSchema,
  orderSchema,
  addressSchema,
  cartAddSchema
};