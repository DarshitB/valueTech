const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const PDFDocument = require("pdfkit");

// Import models and utilities
const Order = require("../../models/orders/order");
const orderMediaPortal = require("../../models/orders/orderMediaPortal");
const orderMediaDocument = require("../../models/orders/orderMediaDocument");
const { ensureDirectoryExists } = require("../../utils/localFileHelper");

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
 * Generate image collage with optional text overlay and convert to PDF
 * POST /api/collage-generator/generate
 */
exports.generateCollage = async (req, res, next) => {
  try {
    const { order_id, text, image_ids } = req.body;
    const { id: userId } = req.user;

    // Validate input
    if (!order_id) {
      throw new BadRequestError("order_id is required");
    }
    if (!image_ids || !Array.isArray(image_ids) || image_ids.length === 0) {
      throw new BadRequestError("image_ids array is required and must not be empty");
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
    await generateCollageImage(imagePaths, collageImagePath, text);

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

/**
 * Generate collage image from multiple images with optional text overlay
 * @param {string[]} imagePaths - Array of local image file paths
 * @param {string} outputPath - Output path for generated collage
 * @param {string} text - Optional text to overlay on collage
 */
async function generateCollageImage(imagePaths, outputPath, text = "") {
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

    try {
      // Resize and process image
      const processedImage = await sharp(imagePaths[i])
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

  // Generate final collage
  await canvas
    .composite(compositeOperations)
    .jpeg({ quality: 100 })
    .toFile(outputPath);
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
 * Create text image for overlay with proper text wrapping
 * @param {string} text - Text to display
 * @param {string[]} imagePaths - Array of image paths to determine count
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Buffer} Image buffer
 */
async function createTextImage(text, imagePaths, width, height) {
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

  // Wrap text to fit within the available width with better calculation
  const wrappedLines = wrapText(text, textWidth, fontSize);

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
        ${wrappedLines
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
          >${line.toUpperCase()}</text>`;
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
      ${wrappedLines
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
        >${line.toUpperCase()}</text>`;
        })
        .join("")}
    </svg>
  `;

  // Convert SVG to image buffer
  return await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Wrap text to fit within specified width with proper calculation
 * @param {string} text - Text to wrap
 * @param {number} maxWidth - Maximum width in pixels
 * @param {number} fontSize - Font size in pixels
 * @returns {string[]} Array of wrapped lines
 */
function wrapText(text, maxWidth, fontSize) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  // Better character width calculation for different font sizes
  const charWidth = fontSize * 0.7; // More accurate character width

  for (const word of words) {
    const testLine = currentLine ? currentLine + " " + word : word;
    // Calculate text width more accurately
    const textWidth = testLine.length * charWidth;

    if (textWidth > maxWidth && currentLine) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine.trim());
  }

  // If any line is still too long, force break it
  const finalLines = [];
  for (const line of lines) {
    if (line.length * charWidth > maxWidth) {
      // Force break long lines by character count
      const maxChars = Math.floor(maxWidth / charWidth);
      let remainingLine = line;
      while (remainingLine.length > maxChars) {
        finalLines.push(remainingLine.substring(0, maxChars));
        remainingLine = remainingLine.substring(maxChars);
      }
      if (remainingLine.length > 0) {
        finalLines.push(remainingLine);
      }
    } else {
      finalLines.push(line);
    }
  }

  return finalLines;
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
