const { User, Settings } = require('../models');

const DEFAULT_SETTINGS = [
  { key: 'qr_code',              value: null,            label: 'UPI QR Code',             group: 'payment' },
  { key: 'serviceable_pincodes', value: [],              label: 'Serviceable Pincodes',    group: 'delivery' },
  { key: 'delivery_charge',      value: 49,              label: 'Delivery Charge (₹)',     group: 'delivery' },
  { key: 'free_delivery_min',    value: 499,             label: 'Free Delivery Above (₹)', group: 'delivery' },
  { key: 'privacy_policy',       value: '<h2>Privacy Policy</h2><p>We value your privacy. Street Kapda collects only the information necessary to process your orders. We do not sell your data to third parties. Your payment information is processed securely. For questions, contact us at support@streetkapda.com.</p>', label: 'Privacy Policy', group: 'legal' },
  { key: 'terms_conditions',     value: '<h2>Terms & Conditions</h2><p>By using Street Kapda you agree to our terms. All orders are subject to availability. Prices may change without notice. Returns accepted within 7 days of delivery in original condition. Street Kapda reserves the right to cancel any order.</p>', label: 'Terms & Conditions', group: 'legal' },
  { key: 'about_app',            value: '<h2>About Street Kapda</h2><p>Street Kapda is your one-stop destination for trendy and affordable street fashion. We offer a wide range of men\'s, women\'s and kids\' clothing at the best prices. Our mission is to make fashion accessible to everyone.</p>', label: 'About App', group: 'general' },
  { key: 'app_version',          value: '4.0.0',         label: 'App Version',             group: 'general' },
  { key: 'contact_email',        value: 'support@streetkapda.com', label: 'Support Email', group: 'contact' },
  { key: 'contact_phone',        value: '7802818509',    label: 'Support Phone',           group: 'contact' },
  { key: 'social_links',         value: { instagram: '', facebook: '', whatsapp: '7802818509' }, label: 'Social Links', group: 'contact' },
  { key: 'return_window_days',   value: 7,               label: 'Return Window (Days)',    group: 'policy' },
  { key: 'referral_reward',      value: 50,              label: 'Referral Reward (₹)',     group: 'rewards' },
];

module.exports = async function seed(connection) {
  try {
    // Create admin if not exists
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      await User.create({
        name:         process.env.ADMIN_NAME     || 'Street Kapda Admin',
        email:        process.env.ADMIN_EMAIL    || 'admin@streetkapda.com',
        phone:        '9000000000',
        password:     process.env.ADMIN_PASSWORD || 'Admin@123',
        role:         'admin',
        referralCode: 'ADMIN001',
      });
      console.log('✅ Admin user created');
    }

    // Seed default settings (only if not already set)
    for (const s of DEFAULT_SETTINGS) {
      await Settings.findOneAndUpdate(
        { key: s.key },
        { $setOnInsert: s },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Default settings seeded');
  } catch (err) {
    console.error('Seed error:', err.message);
  }
};
