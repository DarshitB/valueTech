const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs").promises; // Use promises for async file operations

// Cache transporter to reuse connection (avoids reconnecting each time)
let cachedTransporter = null;

/**
 * Create and configure nodemailer transporter (reused for performance)
 * Uses EMAIL_USER and EMAIL_PASS from environment variables
 */
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("EMAIL_USER and EMAIL_PASS must be configured in environment variables");
  }

  // Reuse existing transporter if available
  if (cachedTransporter) {
    return cachedTransporter;
  }

  // Create new transporter with connection pooling
  cachedTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === "true" ? true : false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    pool: true, // Enable connection pooling
    maxConnections: 5, // Maximum number of connections in pool
    maxMessages: 100, // Maximum messages per connection
  });

  return cachedTransporter;
};

/**
 * Send email with attachments
 * @param {Object} options - Email options
 * @param {string[]} options.to - Array of recipient email addresses
 * @param {string[]} [options.cc] - Array of CC email addresses
 * @param {string[]} [options.bcc] - Array of BCC email addresses
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text email body
 * @param {string} [options.html] - HTML email body
 * @param {Array} [options.attachments] - Array of attachment objects { path, filename }
 * @returns {Promise<Object>} - Result from nodemailer
 */
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: options.to.join(", "),
      subject: options.subject,
      text: options.text || "",
      html: options.html || options.text || "",
    };

    // Add CC if provided
    if (options.cc && options.cc.length > 0) {
      mailOptions.cc = options.cc.join(", ");
    }

    // Add BCC if provided
    if (options.bcc && options.bcc.length > 0) {
      mailOptions.bcc = options.bcc.join(", ");
    }

    // Add attachments if provided
    if (options.attachments && options.attachments.length > 0) {
      // Validate all files exist in parallel (async, non-blocking)
      await Promise.all(
        options.attachments.map(async (attachment) => {
          const filePath = path.join(process.cwd(), attachment.path);
          
          // Check if file exists (async, non-blocking)
          try {
            await fs.access(filePath);
          } catch (error) {
            throw new Error(`Attachment file not found: ${filePath}`);
          }
        })
      );

      // Map attachments after validation
      mailOptions.attachments = options.attachments.map((attachment) => {
        const filePath = path.join(process.cwd(), attachment.path);
        return {
          filename: attachment.filename || path.basename(attachment.path),
          path: filePath,
        };
      });
    }

    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

module.exports = {
  sendEmail,
  createTransporter,
};
