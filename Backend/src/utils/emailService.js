const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs").promises; // Use promises for async file operations
const { cleanupTempAttachments } = require("./imageCompressor");

// Cache transporters keyed by SMTP user to reuse connections per account
const transporterCache = {};

/**
 * Create and configure nodemailer transporter (reused for performance)
 * Uses provided SMTP user/pass or falls back to EMAIL_USER and EMAIL_PASS
 */
const createTransporter = (smtpUser, smtpPass) => {
  const user = smtpUser || process.env.EMAIL_USER;
  const pass = smtpPass || process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error(
      "EMAIL_USER and EMAIL_PASS must be configured in environment variables, or SMTP credentials must be provided"
    );
  }

  // Reuse existing transporter for this user if available
  if (transporterCache[user]) {
    return transporterCache[user];
  }

  // Create new transporter with connection pooling
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === "true" ? true : false, // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
    pool: true, // Enable connection pooling
    maxConnections: 5, // Maximum number of connections in pool
    maxMessages: 100, // Maximum messages per connection
  });

  transporterCache[user] = transporter;
  return transporter;
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
 * @param {string} [options.smtpUser] - Optional SMTP user override
 * @param {string} [options.smtpPass] - Optional SMTP password override
 * @param {string} [options.from] - Optional "from" email override
 * @returns {Promise<Object>} - Result from nodemailer
 */
const sendEmail = async (options) => {
  try {
    // Allow overriding SMTP credentials per email, fallback to environment
    const smtpUser = options.smtpUser || process.env.EMAIL_USER;
    const smtpPass = options.smtpPass || process.env.EMAIL_PASS;

    const transporter = createTransporter(smtpUser, smtpPass);

    const mailOptions = {
      // Use explicitly provided "from" address or default to SMTP user
      from: options.from || smtpUser,
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
          // Handle both absolute and relative paths
          const filePath = path.isAbsolute(attachment.path) 
            ? attachment.path 
            : path.join(process.cwd(), attachment.path);
          
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
        // Handle both absolute and relative paths
        const filePath = path.isAbsolute(attachment.path)
          ? attachment.path
          : path.join(process.cwd(), attachment.path);
        return {
          filename: attachment.filename || path.basename(attachment.path),
          path: filePath,
        };
      });
    }

    const info = await transporter.sendMail(mailOptions);
    
    // Clean up temporary compressed files after successful send
    await cleanupTempAttachments(options.attachments);
    
    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    // Clean up temporary files even on error
    if (options.attachments) {
      await cleanupTempAttachments(options.attachments);
    }
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

module.exports = {
  sendEmail,
  createTransporter,
};
