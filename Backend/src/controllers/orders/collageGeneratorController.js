const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const PDFDocument = require("pdfkit");

// Manual stamp offsets per valuer name (backend-configurable)
// Positive x => right, negative x => left; Positive y => down, negative y => up
// Tweak these values as desired; unlisted names default to { x: 0, y: 0 }
const STAMP_OFFSETS = {
  "V.K. ASSOCIATES": { x: -125, y: 40 },
  "VALUETECH SOLUTIONS": { x: -125, y: 40 },
  "VISHAL D. KOTHARI": { x: -125, y: 40 },
};

// Import models and utilities
const Order = require("../../models/orders/order");
const orderMediaPortal = require("../../models/orders/orderMediaPortal");
const orderMediaDocument = require("../../models/orders/orderMediaDocument");
const OrderStatusHistory = require("../../models/orders/orderStatusHistory");
const {
  ensureDirectoryExists,
  ensureOrderFolders,
  ensureMediaSubfolders,
} = require("../../utils/localFileHelper");
const { generateAndSaveThumbnail } = require("../../utils/thumbnailHelper");

// Import custom error classes
const {
  NotFoundError,
  BadRequestError,
} = require("../../utils/customErrors");

// Configurable styling variables
// 🎨 EASY TO CUSTOMIZE: Change these values anytime to modify text appearance
const TEXT_STYLING = {
  backgroundColor: "#268787", // Dark teal - can be changed anytime
  fontSize: 60, // Base font size - can be changed anytime
  fontFamily: "Arial, sans-serif",
  textColor: "white",
  padding: 20, // Increased padding for better text safety
  lineHeight: 1.3, // Increased line height for better readability
  minFontSize: 12 // Minimum font size to prevent text from becoming unreadable
};

/**
 * Helper function to check if order has both report and collage, and update status to 9 if true
 * @param {number} orderId - The order ID
 * @param {number} userId - The user ID making the change
 */
async function checkAndUpdateOrderStatus(orderId, userId) {
  try {
    // Check if order has at least one report
    const documents = await orderMediaDocument.findByOrderId(orderId);
    const hasReport = documents.some(doc => doc.document_type === 'report');
    
    // Check if order has at least one collage
    const hasCollage = documents.some(doc => doc.document_type === 'collage');
    
    // If both exist, update status to 9
    if (hasReport && hasCollage) {
      await Order.updateOrder(orderId, {
        current_status_id: 9,
        updated_at: new Date(),
        updated_by: userId
      });
      
      // Create status history entry
      const statusHistoryData = {
        order_id: orderId,
        status_id: 9,
        changed_by: userId,
        changed_at: new Date(),
        activity_extra: 'Both report and collage generated'
      };
      
      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    }
  } catch (error) {
    console.error('Error checking/updating order status:', error);
    // Don't throw error - this is a non-critical operation
  }
}

/**
 * Generate image collage with optional text overlay and convert to PDF
 * POST /api/collage-generator/generate
 */
exports.generateCollage = async (req, res, next) => {
  try {
    const { order_id, text, image_ids, orientations } = req.body;
    const { id: userId } = req.user;

    // Validate input
    if (!order_id) {
      throw new BadRequestError("order_id is required");
    }
    if (!image_ids || !Array.isArray(image_ids) || image_ids.length === 0) {
      throw new BadRequestError("image_ids array is required and must not be empty");
    }
    // orientations: optional array, same order as image_ids (e.g. ["default", "right"])
    if (orientations != null && (!Array.isArray(orientations) || orientations.length !== image_ids.length)) {
      throw new BadRequestError("orientations must be an array with same length as image_ids when provided");
    }

    // Get order details
    const order = await Order.findById(order_id, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    
    // Get media files by IDs
    const mediaFiles = await orderMediaPortal.findByIds(image_ids);
    if (mediaFiles.length === 0) {
      throw new BadRequestError("No valid media files found");
    }

    // Sort media files to match the exact order of image_ids from payload
    const sortedMediaFiles = image_ids.map(id => 
      mediaFiles.find(media => media.id.toString() === id.toString())
    ).filter(Boolean); // Remove any undefined entries

    if (sortedMediaFiles.length === 0) {
      throw new BadRequestError("No valid media files found after sorting");
    }

    // Extract image paths from sorted media files
    const imagePaths = sortedMediaFiles.map((media) => {
      // Convert web URL to local file path
      const relativePath = media.media_url.replace("/uploads/", "");
      return path.join(process.cwd(), "uploads", relativePath);
    });

    // Validate image files exist
    for (const imagePath of imagePaths) {
      if (!fs.existsSync(imagePath)) {
        throw new BadRequestError(`Image file not found: ${imagePath}`);
      }
    }

    // Generate collage name from order
    const collageName =
      order.registration_number || order.order_number || `order_${order_id}`;

    // Create upload directory structure: uploads/YYYY/MMM/orderNumber/collages/
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = now.toLocaleString("en-US", { month: "short" });

    // Use order_number for folder creation instead of order_id
    const orderNumber = order.order_number;
    const uploadDir = path.join(
      process.cwd(),
      "uploads",
      year,
      month,
      orderNumber,
      "collages"
    );
    ensureDirectoryExists(uploadDir);

    // Count existing collages in the folder to determine next number (not from database)
    let nextCollageNumber = 1;
    if (fs.existsSync(uploadDir)) {
      const existingFiles = fs.readdirSync(uploadDir);
      const existingCollages = existingFiles.filter(file => 
        file.endsWith('.pdf') && file.includes('collage')
      );
      nextCollageNumber = existingCollages.length + 1;
    }

    // Generate collage image with simple naming: "collage 1", "collage 2", etc.
    const collageImagePath = path.join(uploadDir, `collage_${nextCollageNumber}.jpg`);
    // Determine stamp overlay based on order.valuer_name (same logic as reports)
    let stampBuffer = null;
    let stampOffset = { x: 0, y: 0 };
    try {
      const nameField = order.valuer_name;
      if (nameField) {
        const name = String(nameField).toUpperCase().trim();
        let stampPngFile = null;

        if (name === "V.K. ASSOCIATES") {
          stampPngFile = "vka.png";
        } else if (name === "VALUETECH SOLUTIONS") {
          stampPngFile = "vts.png";
        } else if (name === "VISHAL D. KOTHARI") {
          stampPngFile = "vdk.png"; // keep parity with reports assets
        }

        if (stampPngFile) {
          const stampPath = path.join(process.cwd(), "public", "img", stampPngFile);
          if (fs.existsSync(stampPath)) {
            stampBuffer = fs.readFileSync(stampPath);
          }
        }

        // Apply backend-configured offsets for this valuer (if present)
        if (STAMP_OFFSETS[name]) {
          stampOffset = STAMP_OFFSETS[name];
        }
      }
    } catch (_) {
      // Non-fatal: continue without stamp if any issue
    }

    // orientations[i] corresponds to image_ids[i]; use "default" when not provided
    const orientationsList = orientations != null
      ? orientations.map((o) => (o && String(o).toLowerCase()) || "default")
      : image_ids.map(() => "default");

    await generateCollageImage(imagePaths, collageImagePath, text, stampBuffer, stampOffset, orientationsList);

    // Save orientation for each image to order_media_image_video
    await orderMediaPortal.updateOrientationsByIds(
      image_ids.map((id, idx) => ({ id, orientation: orientationsList[idx] })),
      userId
    );

    // Generate PDF from collage with simple naming: "collage 1", "collage 2", etc.
    const pdfFileName = `collage_${nextCollageNumber}.pdf`;
    const pdfPath = path.join(uploadDir, pdfFileName);
    await generatePDFFromCollage(collageImagePath, pdfPath);

    // Verify PDF was created
    if (!fs.existsSync(pdfPath)) {
      throw new Error("Failed to generate collage PDF");
    }

    // Save document record to database
    const documentData = {
      order_id: order.id,
      media_url: `/uploads/${year}/${month}/${orderNumber}/collages/${pdfFileName}`,
      media_type: "pdf",
      document_type: "collage",
      created_type: "generate", // Added missing field
      created_by: userId,
      created_at: new Date(),
    };

    const documentId = await orderMediaDocument.createDocument(documentData);

    // Set document ID for activity logger
    res.locals.documentId = documentId;

    // Create status history entry for collage generation (just logging, not updating status)
    try {
      const statusHistoryData = {
        order_id: order.id,
        changed_by: userId,
        changed_at: new Date(),
        activity_extra: `Collage generated: ${pdfFileName}`,
      };
      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    } catch (statusHistoryError) {
      console.error("Error creating status history:", statusHistoryError);
      // Don't throw error - this is a non-critical operation
    }

    // Check if both report and collage exist, update status to 9 if true
    await checkAndUpdateOrderStatus(order.id, userId);

    // Return success response with download URL
    res.json({
      success: true,
      message: "Collage generated successfully",
      data: {
        id: documentId,
        download_url: `/uploads/${year}/${month}/${orderNumber}/collages/${pdfFileName}`,
        filename: pdfFileName,
        local_path: pdfPath,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Text-only image: 4:3 aspect ratio so it doesn't squish or stretch when shown in grids/galleries.
// Use object-fit: contain (or size the container to 4:3) on the frontend to avoid distortion.
const TEXT_IMAGE_WIDTH = 1200;
const TEXT_IMAGE_HEIGHT = 900;

/**
 * Create a text-only image with proper font sizing so text is never cut.
 * Iteratively reduces font size and re-wraps until content fits within bounds (like 2, 4, 6 cell collages).
 * @param {string} text - Text to display
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Promise<Buffer>} Image buffer
 */
async function createTextOnlyImage(text, width, height) {
  const normalizedText =
    typeof text === "string" ? text : text == null ? "" : String(text);
  const padding = TEXT_STYLING.padding;
  const textAreaWidth = width - padding * 2;
  const textAreaHeight = height - padding * 2;

  let fontSize = Math.min(
    TEXT_STYLING.fontSize,
    Math.floor(Math.min(width, height) / 12)
  );
  let wrappedLines;
  let lineHeight;
  let totalTextHeight;

  // Iteratively reduce font size and re-wrap until text fits (never cut), like 2/4/6 cell collages
  while (fontSize >= TEXT_STYLING.minFontSize) {
    wrappedLines = wrapTextPreserveWhitespace(
      normalizedText,
      textAreaWidth,
      fontSize
    );
    lineHeight = fontSize * TEXT_STYLING.lineHeight;
    totalTextHeight = wrappedLines.length * lineHeight;
    if (totalTextHeight <= textAreaHeight) break;
    fontSize = Math.max(
      TEXT_STYLING.minFontSize,
      Math.floor((textAreaHeight / wrappedLines.length) / TEXT_STYLING.lineHeight)
    );
  }

  lineHeight = fontSize * TEXT_STYLING.lineHeight;
  totalTextHeight = wrappedLines.length * lineHeight;

  // Vertical center: block center = startY + totalTextHeight/2 - lineHeight/2; set equal to height/2
  // So startY = (height - totalTextHeight)/2 + lineHeight/2 (with dominant-baseline="middle")
  const centeredStartY = (height - totalTextHeight) / 2 + lineHeight / 2;
  const minStartY = padding + fontSize / 2;
  const lastLineBottom = (wrappedLines.length - 1) * lineHeight + fontSize / 2;
  const maxStartY = height - padding - lastLineBottom;
  const startY = Math.max(minStartY, Math.min(maxStartY, centeredStartY));

  const escapedLines = wrappedLines.map((line) => escapeSvgText(line));
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${TEXT_STYLING.backgroundColor}"/>
      ${escapedLines
        .map((line, index) => {
          const y = startY + index * lineHeight;
          return `<text 
          x="50%" 
          y="${y}" 
          font-family="${TEXT_STYLING.fontFamily}" 
          font-size="${fontSize}"
          font-weight="bold"
          fill="${TEXT_STYLING.textColor}" 
          text-anchor="middle" 
          dominant-baseline="middle"
          xml:space="preserve"
        >${line}</text>`;
        })
        .join("")}
    </svg>
  `;
  return await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Generate image from text only (same styling as collage text overlay).
 * Saves to order media folder and inserts record in order_media_image_video with status 4.
 * POST /api/collage-generator/generate-text-image
 */
exports.generateTextCollageImage = async (req, res, next) => {
  try {
    const { order_id, text } = req.body;
    const { id: userId } = req.user;

    if (!order_id) {
      throw new BadRequestError("order_id is required");
    }
    const trimmedText =
      typeof text === "string" ? text.trim() : text == null ? "" : String(text).trim();
    if (!trimmedText) {
      throw new BadRequestError("text is required and must not be empty");
    }

    const order = await Order.findById(order_id, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    const { orderPath } = ensureOrderFolders(order.order_number);
    const { imagesPath } = ensureMediaSubfolders(orderPath);

    const now = new Date();
    const timestamp = Date.now();
    const shortId = uuidv4().substring(0, 8);
    const filename = `text_collage_${timestamp}_${shortId}.jpg`;
    const outputPath = path.join(imagesPath, filename);

    const textImageBuffer = await createTextOnlyImage(
      trimmedText,
      TEXT_IMAGE_WIDTH,
      TEXT_IMAGE_HEIGHT
    );
    await sharp(textImageBuffer).jpeg({ quality: 90 }).toFile(outputPath);
    await generateAndSaveThumbnail(outputPath);

    const relativePath = path
      .relative(path.join(process.cwd(), "uploads"), outputPath)
      .replace(/\\/g, "/");
    const media_url = `/uploads/${relativePath}`;

    const mediaData = {
      order_id: order.id,
      uploader_type: "portal_users",
      uploader_id: userId,
      media_url,
      media_type: "image",
      status: 4,
    };
    const mediaId = await orderMediaPortal.insertMedia(mediaData);

    res.json({
      success: true,
      message: "Text collage image generated and saved to order media",
      data: {
        id: mediaId,
        order_id: order.id,
        media_url,
        media_type: "image",
        status: 4,
        filename,
        width: TEXT_IMAGE_WIDTH,
        height: TEXT_IMAGE_HEIGHT,
        aspect_ratio: "4:3",
      },
    });
  } catch (err) {
    next(err);
  }
};

/** Map orientation label to clockwise rotation in degrees (applied after EXIF). */
const ORIENTATION_DEGREES = {
  default: 0,
  right: 90,
  left: 270,
  down: 180,
};

/**
 * Generate collage image from multiple images with optional text overlay
 * @param {string[]} imagePaths - Array of local image file paths
 * @param {string} outputPath - Output path for generated collage
 * @param {string} text - Optional text to overlay on collage
 * @param {Buffer|null} stampBuffer - Optional PNG buffer to overlay as centered stamp
 * @param {{x:number,y:number}} stampOffset - Optional pixel offsets from center (x: right+, y: down+)
 * @param {string[]} [orientations] - Optional array, same order as imagePaths: "default" | "right" | "left" | "down"
 */
async function generateCollageImage(imagePaths, outputPath, text = "", stampBuffer = null, stampOffset = { x: 0, y: 0 }, orientations = []) {
  const imageCount = imagePaths.length;

  // Canvas dimensions (A4 size at 300 DPI)
  const canvasWidth = 2480;
  const canvasHeight = 3508;

  // Calculate grid layout based on image count
  const { cols, rows } = calculateGridLayout(imageCount, !!text);

  // Calculate thumbnail dimensions
  const thumbWidth = Math.floor(canvasWidth / cols);
  const thumbHeight = Math.floor(canvasHeight / rows);

  // Create canvas using Sharp
  const canvas = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  });

  // Prepare composite operations
  const compositeOperations = [];
  let imageIndex = 0;

  // Add text overlay if provided
  if (text) {
    const textImage = await createTextImage(
      text,
      imagePaths,
      thumbWidth,
      thumbHeight
    );
    compositeOperations.push({
      input: textImage,
      top: 0,
      left: 0,
    });
    imageIndex = 1; // Start placing images after text
  }

  // Process and place images
  for (let i = 0; i < imagePaths.length; i++) {
    const actualIndex = imageIndex + i;
    const x = (actualIndex % cols) * thumbWidth;
    const y = Math.floor(actualIndex / cols) * thumbHeight;

    const orientationLabel = (orientations[i] && String(orientations[i]).toLowerCase()) || "default";
    const extraDegrees = ORIENTATION_DEGREES[orientationLabel] ?? 0;

    try {
      // Step 1: Apply EXIF orientation only (Sharp allows only one rotate per pipeline)
      const afterExif = await sharp(imagePaths[i])
        .rotate()
        .toBuffer();

      // Step 2: Apply user orientation (right/left/down) then resize to cell; second pipeline so rotation is applied
      let pipeline = sharp(afterExif);
      if (extraDegrees !== 0) {
        pipeline = pipeline.rotate(extraDegrees);
      }
      const processedImage = await pipeline
        .resize(thumbWidth, thumbHeight, { fit: "fill" })
        .jpeg({ quality: 90 })
        .toBuffer();

      compositeOperations.push({
        input: processedImage,
        top: y,
        left: x,
      });
    } catch (error) {
      console.warn(`Failed to process image ${imagePaths[i]}:`, error.message);
    }
  }

  // Add centered stamp overlay if provided
  if (stampBuffer) {
    try {
      // Resize stamp to fit nicely on page (approx 25% of min dimension)
      const targetHeight = Math.floor(Math.min(canvasWidth, canvasHeight) * 0.25);
      const resizedStamp = await sharp(stampBuffer)
        .resize({ height: targetHeight, fit: "inside" })
        .png()
        .toBuffer();

      // Compute explicit top/left so we can apply offsets relative to center
      const stampMeta = await sharp(resizedStamp).metadata();
      const stampW = stampMeta.width || targetHeight; // approximate if missing
      const stampH = stampMeta.height || targetHeight;
      const centerLeft = Math.floor((canvasWidth - stampW) / 2);
      const centerTop = Math.floor((canvasHeight - stampH) / 2);

      compositeOperations.push({
        input: resizedStamp,
        left: centerLeft + (stampOffset?.x || 0),
        top: centerTop + (stampOffset?.y || 0),
      });
    } catch (_) {
      // Ignore stamp errors silently
    }
  }

  // Generate final collage
  await canvas.composite(compositeOperations).jpeg({ quality: 100 }).toFile(outputPath);
}

/**
 * Calculate optimal grid layout for images
 * @param {number} imageCount - Number of images
 * @param {boolean} hasText - Whether text overlay is included
 * @returns {object} { cols, rows }
 */
function calculateGridLayout(imageCount, hasText) {
  const totalCells = imageCount + (hasText ? 1 : 0);

  // Custom logic for defining columns and rows
  if (totalCells <= 2) return { cols: 1, rows: 2 };
  if (totalCells <= 4) return { cols: 2, rows: 2 };
  if (totalCells <= 6) return { cols: 2, rows: 3 };
  if (totalCells <= 8) return { cols: 2, rows: 4 };
  if (totalCells <= 10) return { cols: 2, rows: 5 };
  if (totalCells <= 12) return { cols: 3, rows: 4 };
  if (totalCells <= 14) return { cols: 3, rows: 5 };
  if (totalCells <= 16) return { cols: 4, rows: 4 };
  if (totalCells <= 18) return { cols: 3, rows: 6 };
  if (totalCells <= 20) return { cols: 4, rows: 5 };
  if (totalCells <= 22) return { cols: 4, rows: 6 };
  if (totalCells <= 24) return { cols: 4, rows: 6 };
  if (totalCells <= 26) return { cols: 4, rows: 7 };
  if (totalCells <= 28) return { cols: 4, rows: 7 };
  if (totalCells <= 30) return { cols: 5, rows: 6 };

  // Fallback for higher numbers
  const cols = Math.ceil(Math.sqrt(totalCells));
  const rows = Math.ceil(totalCells / cols);
  return { cols, rows };
}

/**
 * Escape special characters so user text is safe inside SVG
 */
function escapeSvgText(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Create text image for overlay with proper text wrapping
 * @param {string} text - Text to display
 * @param {string[]} imagePaths - Array of image paths to determine count
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Buffer} Image buffer
 */
async function createTextImage(text, imagePaths, width, height) {
  const normalizedText =
    typeof text === "string" ? text : text == null ? "" : String(text);

  // Calculate available text area (subtract padding)
  const textWidth = width - TEXT_STYLING.padding * 2;
  const textHeight = height - TEXT_STYLING.padding * 2;

  // 🎯 CONDITIONAL FONT SIZE BASED ON IMAGE COUNT
  // 💡 EASY TO ADD MORE CONDITIONS: You can add more conditions here for different scenarios
  let adjustedFontSize = TEXT_STYLING.fontSize;

  if (imagePaths.length > 15) {
    // Reduce font size for collages with more than 15 images
    adjustedFontSize = Math.floor(TEXT_STYLING.fontSize * 0.5); // 50% of original size
  } else if (imagePaths.length > 10) {
    // Reduce font size for collages with more than 10 images
    adjustedFontSize = Math.floor(TEXT_STYLING.fontSize * 0.8); // 80% of original size
  } else if (imagePaths.length > 5) {
    // Reduce font size for collages with more than 5 images
    adjustedFontSize = Math.floor(TEXT_STYLING.fontSize * 0.9); // 90% of original size
  }

  // 💡 EXAMPLE: You can add more conditions here like:
  // if (imagePaths.length > 20) adjustedFontSize = Math.floor(TEXT_STYLING.fontSize * 0.6);
  // if (imagePaths.length > 25) adjustedFontSize = Math.floor(TEXT_STYLING.fontSize * 0.5);
  // if (text.length > 100) adjustedFontSize = Math.floor(adjustedFontSize * 0.9); // Based on text length
  // if (width < 500) adjustedFontSize = Math.floor(adjustedFontSize * 0.8); // Based on available width

  // Calculate font size based on available space - more conservative approach
  const maxFontSize = Math.min(width, height) / 12; // Reduced from /8 to /12 for better fit
  const fontSize = Math.min(adjustedFontSize, maxFontSize);

  // Wrap text to fit within the available width while preserving whitespace/newlines
  const wrappedLines = wrapTextPreserveWhitespace(
    normalizedText,
    textWidth,
    fontSize
  );
  const escapedLines = wrappedLines.map((line) => escapeSvgText(line));

  // Calculate total text height
  const lineHeight = fontSize * TEXT_STYLING.lineHeight;
  const totalTextHeight = wrappedLines.length * lineHeight;

  // Ensure text fits within available height, reduce font size if needed
  let finalFontSize = fontSize;
  if (totalTextHeight > textHeight) {
    finalFontSize = Math.max(
      TEXT_STYLING.minFontSize,
      Math.floor(textHeight / wrappedLines.length / TEXT_STYLING.lineHeight)
    );

    // Recalculate with new font size
    const newLineHeight = finalFontSize * TEXT_STYLING.lineHeight;
    const newTotalHeight = wrappedLines.length * newLineHeight;
    const newStartY = Math.max(
      finalFontSize, // Ensure text doesn't start too close to top
      (height - newTotalHeight) / 2 + finalFontSize
    );

    // Create SVG with adjusted font size
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${
          TEXT_STYLING.backgroundColor
        }"/>
        ${escapedLines
          .map((line, index) => {
            const y = newStartY + index * newLineHeight;
            return `<text 
            x="50%" 
            y="${y}" 
            font-family="${TEXT_STYLING.fontFamily}" 
            font-size="${finalFontSize}"
            font-weight="bold"
            fill="${TEXT_STYLING.textColor}" 
            text-anchor="middle" 
            dominant-baseline="middle"
            xml:space="preserve"
          >${line}</text>`;
          })
          .join("")}
      </svg>
    `;

    return await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  }

  // Center text vertically with original font size, but ensure it's within bounds
  const startY = Math.max(
    fontSize, // Ensure text doesn't start too close to top
    (height - totalTextHeight) / 2 + fontSize
  );

  // Create SVG with wrapped text
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${TEXT_STYLING.backgroundColor}"/>
      ${escapedLines
        .map((line, index) => {
          const y = startY + index * lineHeight;
          return `<text 
          x="50%" 
          y="${y}" 
          font-family="${TEXT_STYLING.fontFamily}" 
          font-size="${fontSize}"
          font-weight="bold"
          fill="${TEXT_STYLING.textColor}" 
          text-anchor="middle" 
          dominant-baseline="middle"
          xml:space="preserve"
        >${line}</text>`;
        })
        .join("")}
    </svg>
  `;

  // Convert SVG to image buffer
  return await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Wrap text while preserving spaces and explicit newlines.
 * Uses word-aware wrapping; only breaks inside a word if it exceeds max width.
 */
function wrapTextPreserveWhitespace(text, maxWidth, fontSize) {
  const lines = [];
  const rawLines = String(text).split(/\r?\n/);
  const charWidth = fontSize * 0.7;
  const maxChars = Math.max(2, Math.floor(maxWidth / charWidth)); // avoid 1-char lines

  for (const rawLine of rawLines) {
    // Keep whitespace tokens so multiple spaces are preserved
    const tokens = rawLine.split(/(\s+)/);
    let current = "";

    for (const token of tokens) {
      const tokenLen = token.length;

      // Handle tokens longer than the limit by chunking
      if (tokenLen > maxChars) {
        // Flush current line first
        if (current) {
          lines.push(current);
          current = "";
        }
        const chunks = token.match(new RegExp(`.{1,${maxChars}}`, "g")) || [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          // If not the last chunk, push immediately to avoid trailing whitespace issues
          if (i < chunks.length - 1) {
            lines.push(chunk);
          } else {
            current = chunk; // keep last chunk to allow following tokens on same line
          }
        }
        continue;
      }

      const nextLength = current.length + tokenLen;
      if (current && nextLength > maxChars) {
        lines.push(current);
        // Start new line; avoid leading whitespace overflow
        current = token.trim().length === 0 ? "" : token;
      } else {
        current += token;
      }
    }

    lines.push(current);
  }

  return lines;
}

/**
 * Generate PDF from collage image
 * @param {string} imagePath - Path to collage image
 * @param {string} outputPath - Output path for PDF
 */
async function generatePDFFromCollage(imagePath, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "portrait",
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Add image to PDF
    doc.image(imagePath, 0, 0, {
      width: doc.page.width,
      height: doc.page.height,
    });

    doc.end();

    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}
