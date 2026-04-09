
const nodemailer = require('nodemailer');
const { logger } = require('./logger');

let transporter = null;

const initTransporter = () => {
  if (!transporter && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      pool: true, // Use pooled connections
      maxConnections: 5,
      rateLimit: 10, // Max 10 emails per second
    });
    
    // Verify connection
    transporter.verify((error, success) => {
      if (error) {
        logger.error('Email transporter error:', error);
      } else {
        logger.info('Email transporter ready');
      }
    });
  }
  return transporter;
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken, userName) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Reset Your Password</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1A2C3E, #2A3F54); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fc; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #1A2C3E; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; border-top: 1px solid #eee; margin-top: 20px; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; font-size: 14px; border-radius: 4px; }
        h3 { margin-top: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Street Kapda</h2>
          <p>Trendy & Affordable Fashion</p>
        </div>
        <div class="content">
          <h3>Hello ${userName || 'User'},</h3>
          <p>We received a request to reset your password for your Street Kapda account.</p>
          <p>Click the button below to create a new password:</p>
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="background: #e9ecef; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 12px;">${resetUrl}</p>
          <div class="warning">
            <strong>⚠️ This link will expire in 1 hour.</strong><br>
            If you didn't request a password reset, please ignore this email or contact support.
          </div>
        </div>
        <div class="footer">
          <p>&copy; 2025 Street Kapda. All rights reserved.</p>
          <p>Need help? Contact us at <a href="mailto:${process.env.EMAIL_FROM}">${process.env.EMAIL_FROM}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const transporter = initTransporter();
  if (!transporter) {
    logger.error('Email not configured. Cannot send password reset email.');
    return false;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Street Kapda" <noreply@streetkapda.com>',
    to: email,
    subject: 'Reset Your Street Kapda Password',
    html: html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Password reset email sent to ${email}`, { messageId: info.messageId });
    return true;
  } catch (error) {
    logger.error('Password reset email error:', error);
    return false;
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, userName) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Welcome to Street Kapda</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1A2C3E, #2A3F54); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fc; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #1A2C3E; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; border-top: 1px solid #eee; margin-top: 20px; }
        ul { padding-left: 20px; }
        li { margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Welcome to Street Kapda!</h2>
        </div>
        <div class="content">
          <h3>Hello ${userName},</h3>
          <p>Thank you for joining Street Kapda! 🎉</p>
          <p>You now have access to:</p>
          <ul>
            <li>🛍️ Latest trendy fashion</li>
            <li>💰 Exclusive discounts and offers</li>
            <li>🚚 Fast delivery across India</li>
            <li>⭐ Easy returns within 7 days</li>
          </ul>
          <p>Start shopping now and enjoy the best deals!</p>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/login" class="button">Shop Now</a>
          </div>
        </div>
        <div class="footer">
          <p>&copy; 2025 Street Kapda. All rights reserved.</p>
          <p>Follow us on social media for latest updates!</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const transporter = initTransporter();
  if (!transporter) {
    logger.error('Email not configured. Cannot send welcome email.');
    return false;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Street Kapda" <noreply@streetkapda.com>',
    to: email,
    subject: 'Welcome to Street Kapda! 🎉',
    html: html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Welcome email sent to ${email}`, { messageId: info.messageId });
    return true;
  } catch (error) {
    logger.error('Welcome email error:', error);
    return false;
  }
};

module.exports = { sendPasswordResetEmail, sendWelcomeEmail };