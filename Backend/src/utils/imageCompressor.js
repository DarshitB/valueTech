const sharp = require("sharp");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { ensureDirectoryExists } = require("./localFileHelper");
const PDFDocument = require("pdfkit");
const puppeteer = require("puppeteer");

/**
 * Check if a file is an image based on its extension
 * @param {string} filePath - Path to the file
 * @returns {boolean} - True if file is an image
 */
function isImageFile(filePath) {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(filePath).toLowerCase();
  return imageExtensions.includes(ext);
}

/**
 * Check if a file is a PDF
 * @param {string} filePath - Path to the file
 * @returns {boolean} - True if file is a PDF
 */
function isPdfFile(filePath) {
  return path.extname(filePath).toLowerCase() === ".pdf";
}

/**
 * Compress an image to a target file size while maintaining quality
 * Uses adaptive quality algorithm to achieve target size
 * @param {string} inputPath - Path to the input image
 * @param {number} targetSizeMB - Target file size in MB (default: 1)
 * @returns {Promise<string>} - Path to the compressed image
 */
async function compressImageForEmail(inputPath, targetSizeMB = 1) {
  try {
    // Verify input file exists
    await fs.access(inputPath);

    // Get input file stats
    const inputStats = await fs.stat(inputPath);
    const inputSizeMB = inputStats.size / (1024 * 1024);

    // If file is already smaller than target, return original path
    if (inputSizeMB <= targetSizeMB) {
      return inputPath;
    }

    // Create temp directory
    const tempDir = path.join(process.cwd(), "uploads", "temp_email");
    ensureDirectoryExists(tempDir);

    // Generate unique filename for compressed image
    const originalFilename = path.basename(inputPath);
    const ext = path.extname(originalFilename);
    const nameWithoutExt = path.basename(originalFilename, ext);
    const compressedFilename = `compressed_${uuidv4()}_${nameWithoutExt}.jpg`;
    const tempPath = path.join(tempDir, compressedFilename);

    // Get image metadata to check format
    const metadata = await sharp(inputPath).metadata();
    
    // Start with quality 85 and reduce until target size is met
    let quality = 85;
    const minQuality = 60; // Minimum quality to maintain clarity
    const targetSizeBytes = targetSizeMB * 1024 * 1024;

    let compressedSize = 0;
    let attemptCount = 0;
    const maxAttempts = 6; // Prevents infinite loops

    while (quality >= minQuality && attemptCount < maxAttempts) {
      attemptCount++;

      // Compress image to JPEG with current quality
      await sharp(inputPath)
        .rotate() // Auto-rotate based on EXIF
        .jpeg({ 
          quality, 
          mozjpeg: true, // Use mozjpeg for better compression
          chromaSubsampling: '4:2:0' // Reduce color data for smaller size
        })
        .toFile(tempPath);

      // Check compressed file size
      const stats = await fs.stat(tempPath);
      compressedSize = stats.size;
      const sizeMB = compressedSize / (1024 * 1024);

      // If size is acceptable, return the compressed path
      if (compressedSize <= targetSizeBytes) {
        console.log(
          `Image compressed: ${path.basename(inputPath)} ` +
          `(${inputSizeMB.toFixed(2)}MB → ${sizeMB.toFixed(2)}MB, quality: ${quality})`
        );
        return tempPath;
      }

      // If still too large, reduce quality and try again
      quality -= 5;

      // Delete the file to prepare for next attempt (except last attempt)
      if (quality >= minQuality && attemptCount < maxAttempts) {
        await fs.unlink(tempPath).catch(() => {});
      }
    }

    // If we couldn't meet target size, return the last attempt
    const finalSizeMB = compressedSize / (1024 * 1024);
    console.log(
      `Image compressed (best effort): ${path.basename(inputPath)} ` +
      `(${inputSizeMB.toFixed(2)}MB → ${finalSizeMB.toFixed(2)}MB, quality: ${quality + 5})`
    );
    
    return tempPath;
  } catch (error) {
    console.error(`Error compressing image ${inputPath}:`, error.message);
    // Return original path if compression fails
    return inputPath;
  }
}

/**
 * Extract image from PDF using multiple fallback methods
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputImagePath - Where to save the extracted image
 * @returns {Promise<boolean>} - True if successful
 */
async function extractImageFromPdf(pdfPath, outputImagePath) {
  // Method 1: Try to find source JPG file (fastest - for generated collages)
  const pdfDir = path.dirname(pdfPath);
  const pdfBasename = path.basename(pdfPath, '.pdf');
  const sourceImagePath = path.join(pdfDir, `${pdfBasename}.jpg`);
  
  if (fsSync.existsSync(sourceImagePath)) {
    try {
      // Copy source JPG to output path
      await fs.copyFile(sourceImagePath, outputImagePath);
      console.log(`Used source JPG for ${path.basename(pdfPath)}`);
      return true;
    } catch (copyError) {
      console.warn(`Failed to copy source JPG: ${copyError.message}`);
      // Continue to next method
    }
  }

  // Method 2: Try Sharp PDF conversion (works for some PDFs)
  try {
    await sharp(pdfPath, { density: 300 })
      .jpeg({ quality: 100 })
      .toFile(outputImagePath);
    
    console.log(`Extracted image using Sharp for ${path.basename(pdfPath)}`);
    return true;
  } catch (sharpError) {
    console.warn(`Sharp extraction failed: ${sharpError.message}`);
    // Continue to next method
  }

  // Method 3: Use Puppeteer to render PDF as image (most reliable, slower)
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set viewport to A4 size at 300 DPI
    await page.setViewport({
      width: 2480,  // A4 width at 300 DPI
      height: 3508, // A4 height at 300 DPI
      deviceScaleFactor: 1
    });
    
    // Load PDF
    const pdfBuffer = await fs.readFile(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');
    const pdfDataUri = `data:application/pdf;base64,${pdfBase64}`;
    
    await page.goto(pdfDataUri, { waitUntil: 'networkidle0' });
    
    // Take screenshot
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 100 });
    await fs.writeFile(outputImagePath, screenshot);
    
    await browser.close();
    
    console.log(`Extracted image using Puppeteer for ${path.basename(pdfPath)}`);
    return true;
    
  } catch (puppeteerError) {
    console.error(`Puppeteer extraction failed: ${puppeteerError.message}`);
    
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        // Ignore
      }
    }
    
    return false;
  }
}

/**
 * Compress a PDF (collage PDF) by converting it to image, compressing, and regenerating
 * Works directly on PDF without needing source JPG files
 * Uses multiple fallback methods for maximum reliability
 * @param {string} inputPdfPath - Path to the input PDF
 * @param {number} targetSizeMB - Target file size in MB (default: 1)
 * @returns {Promise<{path: string, tempImagePath: string|null}>} - Paths to compressed PDF and temp image
 */
async function compressPdfForEmail(inputPdfPath, targetSizeMB = 1) {
  let tempImagePath = null;
  let tempCompressedImagePath = null;
  
  try {
    // Verify input file exists
    try {
      await fs.access(inputPdfPath);
    } catch (accessError) {
      console.error(`PDF file not found: ${inputPdfPath}`);
      return { path: inputPdfPath, tempImagePath: null };
    }

    // Get input file stats
    const inputStats = await fs.stat(inputPdfPath);
    const inputSizeMB = inputStats.size / (1024 * 1024);

    // Only compress if file is larger than target size
    if (inputSizeMB <= targetSizeMB) {
      console.log(`PDF already under target size: ${path.basename(inputPdfPath)} (${inputSizeMB.toFixed(2)}MB) - skipping compression`);
      return { path: inputPdfPath, tempImagePath: null };
    }

    // Create temp directory
    const tempDir = path.join(process.cwd(), "uploads", "temp_email");
    try {
      ensureDirectoryExists(tempDir);
    } catch (dirError) {
      console.error(`Failed to create temp directory: ${dirError.message}`);
      return { path: inputPdfPath, tempImagePath: null };
    }

    const pdfBasename = path.basename(inputPdfPath, '.pdf');
    
    // Step 1: Extract image from PDF using multiple methods
    const extractedImageFilename = `extracted_${uuidv4()}_${pdfBasename}.jpg`;
    tempImagePath = path.join(tempDir, extractedImageFilename);
    
    const extractionSuccess = await extractImageFromPdf(inputPdfPath, tempImagePath);
    
    if (!extractionSuccess) {
      console.error(`All extraction methods failed for ${path.basename(inputPdfPath)}`);
      return { path: inputPdfPath, tempImagePath: null };
    }

    // Verify extracted image exists
    try {
      await fs.access(tempImagePath);
    } catch (imgAccessError) {
      console.error(`Extracted image not found: ${tempImagePath}`);
      return { path: inputPdfPath, tempImagePath: null };
    }

    // Step 2: Compress the extracted image to target size
    try {
      tempCompressedImagePath = await compressImageToTargetSize(tempImagePath, targetSizeMB * 0.95); // 95% to account for PDF overhead
    } catch (compressError) {
      console.error(`Failed to compress extracted image: ${compressError.message}`);
      
      // Cleanup extracted image
      try {
        await fs.unlink(tempImagePath);
      } catch (cleanupError) {
        // Ignore
      }
      
      return { path: inputPdfPath, tempImagePath: null };
    }

    // Step 3: Generate new PDF from compressed image
    const compressedPdfFilename = `compressed_${uuidv4()}_${pdfBasename}.pdf`;
    const compressedPdfPath = path.join(tempDir, compressedPdfFilename);

    try {
      await generateCompressedPdf(tempCompressedImagePath, compressedPdfPath);
    } catch (pdfGenError) {
      console.error(`Failed to generate compressed PDF: ${pdfGenError.message}`);
      
      // Cleanup temp files
      try {
        await fs.unlink(tempImagePath);
        if (tempCompressedImagePath !== tempImagePath) {
          await fs.unlink(tempCompressedImagePath);
        }
      } catch (cleanupError) {
        // Ignore
      }
      
      return { path: inputPdfPath, tempImagePath: null };
    }

    // Step 4: Verify PDF was created and check final size
    try {
      const finalStats = await fs.stat(compressedPdfPath);
      const finalSizeMB = finalStats.size / (1024 * 1024);

      console.log(
        `PDF compressed: ${path.basename(inputPdfPath)} ` +
        `(${inputSizeMB.toFixed(2)}MB → ${finalSizeMB.toFixed(2)}MB)`
      );

      // Cleanup temporary image files but keep the PDF
      try {
        await fs.unlink(tempImagePath);
        if (tempCompressedImagePath !== tempImagePath) {
          await fs.unlink(tempCompressedImagePath);
        }
      } catch (cleanupError) {
        console.warn(`Warning: Failed to cleanup temp images: ${cleanupError.message}`);
      }
      
      return { path: compressedPdfPath, tempImagePath: null };
      
    } catch (finalStatError) {
      console.error(`Compressed PDF not found: ${finalStatError.message}`);
      
      // Cleanup all temp files
      try {
        await fs.unlink(tempImagePath);
        if (tempCompressedImagePath !== tempImagePath) {
          await fs.unlink(tempCompressedImagePath);
        }
      } catch (cleanupError) {
        // Ignore
      }
      
      return { path: inputPdfPath, tempImagePath: null };
    }

  } catch (error) {
    console.error(`Error compressing PDF ${inputPdfPath}:`, error.message);
    
    // Cleanup any temp files
    if (tempImagePath) {
      try {
        await fs.unlink(tempImagePath);
      } catch (e) {
        // Ignore
      }
    }
    if (tempCompressedImagePath && tempCompressedImagePath !== tempImagePath) {
      try {
        await fs.unlink(tempCompressedImagePath);
      } catch (e) {
        // Ignore
      }
    }
    
    return { path: inputPdfPath, tempImagePath: null };
  }
}

/**
 * Compress image to target size with adaptive quality
 * More aggressive quality reduction to hit target size accurately
 * @param {string} inputPath - Path to input image
 * @param {number} targetSizeMB - Target size in MB
 * @returns {Promise<string>} - Path to compressed image
 */
async function compressImageToTargetSize(inputPath, targetSizeMB = 1) {
  let tempPath = null;
  
  try {
    // Verify input file exists
    try {
      await fs.access(inputPath);
    } catch (error) {
      console.error(`Input file not found: ${inputPath}`);
      return inputPath;
    }

    const inputStats = await fs.stat(inputPath);
    const inputSizeMB = inputStats.size / (1024 * 1024);

    // Always compress if larger than 1MB to get it down to ~1MB
    if (inputSizeMB <= targetSizeMB) {
      console.log(`Image already at target: ${path.basename(inputPath)} (${inputSizeMB.toFixed(2)}MB)`);
      return inputPath;
    }

    const tempDir = path.join(process.cwd(), "uploads", "temp_email");
    ensureDirectoryExists(tempDir);

    const originalFilename = path.basename(inputPath);
    const nameWithoutExt = path.basename(originalFilename, path.extname(originalFilename));
    const compressedFilename = `compressed_${uuidv4()}_${nameWithoutExt}.jpg`;
    tempPath = path.join(tempDir, compressedFilename);

    const targetSizeBytes = targetSizeMB * 1024 * 1024;
    const tolerance = 0.1; // 10% tolerance (0.9MB - 1.1MB is acceptable)
    const lowerBound = targetSizeBytes * (1 - tolerance);
    const upperBound = targetSizeBytes * (1 + tolerance);

    // Start with quality based on compression ratio needed
    // More aggressive starting point for better accuracy
    const compressionRatio = targetSizeMB / inputSizeMB;
    let quality = Math.max(50, Math.min(90, Math.floor(compressionRatio * 95)));
    
    const minQuality = 50;
    const maxQuality = 95;
    let attemptCount = 0;
    const maxAttempts = 12;
    let lastSize = 0;
    let bestQuality = quality;
    let closestSize = 0;

    while (attemptCount < maxAttempts) {
      attemptCount++;

      try {
        // Compress with current quality
        await sharp(inputPath)
          .rotate()
          .jpeg({ 
            quality, 
            mozjpeg: true,
            chromaSubsampling: '4:2:0'
          })
          .toFile(tempPath);

        // Check file size
        let currentSize = 0;
        try {
          const stats = await fs.stat(tempPath);
          currentSize = stats.size;
        } catch (statError) {
          console.error(`Failed to stat compressed file: ${statError.message}`);
          break;
        }

        const currentSizeMB = currentSize / (1024 * 1024);

        // Track best attempt
        if (Math.abs(currentSize - targetSizeBytes) < Math.abs(closestSize - targetSizeBytes)) {
          closestSize = currentSize;
          bestQuality = quality;
        }

        // If within acceptable range, we're done!
        if (currentSize >= lowerBound && currentSize <= upperBound) {
          console.log(
            `Image compressed to target: ${path.basename(inputPath)} ` +
            `(${inputSizeMB.toFixed(2)}MB → ${currentSizeMB.toFixed(2)}MB, quality: ${quality})`
          );
          return tempPath;
        }

        // Determine next quality adjustment
        let nextQuality = quality;
        
        if (currentSize > upperBound) {
          // Too large - reduce quality
          const overshoot = (currentSize - targetSizeBytes) / targetSizeBytes;
          const reduction = Math.max(3, Math.min(15, Math.floor(overshoot * 40)));
          nextQuality = Math.max(minQuality, quality - reduction);
          
          if (nextQuality === quality) break; // Can't go lower
          
        } else if (currentSize < lowerBound) {
          // Too small - increase quality (but be conservative)
          const undershoot = (targetSizeBytes - currentSize) / targetSizeBytes;
          const increase = Math.max(2, Math.min(8, Math.floor(undershoot * 25)));
          nextQuality = Math.min(maxQuality, quality + increase);
          
          if (nextQuality === quality) break; // Can't go higher
        }

        // If we're oscillating, stop
        if (attemptCount > 3 && Math.abs(currentSize - lastSize) < targetSizeBytes * 0.02) {
          break;
        }

        lastSize = currentSize;
        quality = nextQuality;

        // Delete temp file for next attempt (only if not last attempt)
        if (attemptCount < maxAttempts) {
          try {
            await fs.unlink(tempPath);
          } catch (unlinkError) {
            // File might not exist, that's ok
          }
        }

      } catch (sharpError) {
        console.error(`Sharp compression error on attempt ${attemptCount}: ${sharpError.message}`);
        
        // Try to recover by adjusting quality
        if (quality > minQuality + 10) {
          quality -= 10;
          continue;
        } else {
          break;
        }
      }
    }

    // Verify final file exists
    try {
      const finalStats = await fs.stat(tempPath);
      const finalSizeMB = finalStats.size / (1024 * 1024);
      console.log(
        `Image compressed (best effort): ${path.basename(inputPath)} ` +
        `(${inputSizeMB.toFixed(2)}MB → ${finalSizeMB.toFixed(2)}MB, quality: ${bestQuality})`
      );
      return tempPath;
    } catch (finalStatError) {
      console.error(`Final compressed file not found, using original: ${finalStatError.message}`);
      return inputPath;
    }

  } catch (error) {
    console.error(`Error in compressImageToTargetSize for ${inputPath}:`, error.message);
    
    // Clean up any temp file that might exist
    if (tempPath) {
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
    
    return inputPath;
  }
}

/**
 * Generate PDF from compressed image
 * @param {string} imagePath - Path to the compressed image
 * @param {string} outputPdfPath - Output path for PDF
 */
function generateCompressedPdf(imagePath, outputPdfPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "portrait",
      compress: true, // Enable PDF compression
    });

    const stream = fsSync.createWriteStream(outputPdfPath);
    doc.pipe(stream);

    // Add image to PDF with compression
    doc.image(imagePath, 0, 0, {
      width: doc.page.width,
      height: doc.page.height,
    });

    doc.end();

    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

/**
 * Delete a temporary compressed file
 * @param {string} filePath - Path to the file to delete
 */
async function cleanupTempFile(filePath) {
  try {
    // Only delete files in temp_email directory
    if (filePath.includes("temp_email")) {
      await fs.unlink(filePath);
      console.log(`Cleaned up temp file: ${path.basename(filePath)}`);
    }
  } catch (error) {
    // Ignore errors during cleanup (file might not exist)
    console.warn(`Failed to cleanup temp file ${filePath}:`, error.message);
  }
}

/**
 * Clean up multiple temporary files
 * @param {Array<{path: string, isTemporary?: boolean}>} attachments - Array of attachment objects
 */
async function cleanupTempAttachments(attachments) {
  if (!attachments || !Array.isArray(attachments)) {
    return;
  }

  const cleanupPromises = attachments
    .filter(attachment => attachment.isTemporary === true)
    .map(attachment => cleanupTempFile(attachment.path));

  await Promise.allSettled(cleanupPromises);
}

module.exports = {
  isImageFile,
  isPdfFile,
  compressImageForEmail,
  compressPdfForEmail,
  compressImageToTargetSize,
  cleanupTempFile,
  cleanupTempAttachments,
};
