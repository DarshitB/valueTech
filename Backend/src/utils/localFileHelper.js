const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Base uploads directory - create if it doesn't exist
const UPLOADS_BASE_DIR = path.join(process.cwd(), 'uploads');

// Cache for folder paths to avoid repeated file system checks
const folderCache = new Map();

/**
 * Ensure directory exists, create if it doesn't
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Get cached folder path or create and cache it
 */
function getCachedFolderPath(key, createFunction) {
  if (folderCache.has(key)) {
    return folderCache.get(key);
  }
  
  const folderPath = createFunction();
  folderCache.set(key, folderPath);
  return folderPath;
}

/**
 * Build or find the required hierarchy:
 * /uploads/YYYY/MMM/<orderNumber>/
 * Returns { yearPath, monthPath, orderPath }
 */
function ensureOrderFolders(orderNumber) {
  const cacheKey = `order_${orderNumber}`;
  
  return getCachedFolderPath(cacheKey, () => {
    // Create current year/month structure
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = now.toLocaleString('en-US', { month: 'short' }); // e.g., "Aug"

    // Create folders sequentially since they depend on each other
    const yearPath = ensureDirectoryExists(path.join(UPLOADS_BASE_DIR, year));
    const monthPath = ensureDirectoryExists(path.join(yearPath, month));
    const orderPath = ensureDirectoryExists(path.join(monthPath, orderNumber));

    return {
      yearPath,
      monthPath,
      orderPath,
      created: true,
    };
  });
}

/**
 * Ensure subfolders "images" and "videos" under an order folder
 */
function ensureMediaSubfolders(orderPath) {
  const cacheKey = `media_${orderPath}`;
  
  return getCachedFolderPath(cacheKey, () => {
    const imagesPath = ensureDirectoryExists(path.join(orderPath, 'images'));
    const videosPath = ensureDirectoryExists(path.join(orderPath, 'videos'));
    
    return { imagesPath, videosPath };
  });
}

/**
 * Copy file to target folder and return file info
 */
function copyFileToFolder(sourcePath, fileName, targetFolderPath) {
  // Check if source file exists before copying
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  
  const targetPath = path.join(targetFolderPath, fileName);
  
  try {
    // Copy file to target location
    fs.copyFileSync(sourcePath, targetPath);
    
    // Verify the copy was successful
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Failed to copy file to target: ${targetPath}`);
    }
    
    // Get file stats for additional info
    const stats = fs.statSync(targetPath);
    
    return {
      id: uuidv4(), // Generate unique ID for local files
      name: fileName,
      path: targetPath,
      size: stats.size,
      created: new Date(),
      // Create web-accessible URL (relative to uploads folder)
      webContentLink: `/uploads/${path.relative(UPLOADS_BASE_DIR, targetPath).replace(/\\/g, '/')}`,
      webViewLink: `/uploads/${path.relative(UPLOADS_BASE_DIR, targetPath).replace(/\\/g, '/')}`
    };
  } catch (error) {
    // If copy fails, provide detailed error information
    throw new Error(`Failed to copy file from ${sourcePath} to ${targetPath}: ${error.message}`);
  }
}

/**
 * Copy multiple files in parallel for better performance
 */
function copyMultipleFilesToFolder(files) {
  const copyPromises = files.map(file => 
    copyFileToFolder(file.path, file.name, file.targetFolderPath)
  );
  
  return Promise.all(copyPromises);
}

/**
 * Build logical path for database storage
 */
function buildLogicalPath(orderNumber, fileType, fileName) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.toLocaleString('en-US', { month: 'short' });
  
  return `${year}/${month}/${orderNumber}/${fileType}s/${fileName}`;
}

/**
 * Clean up temporary files
 */
function cleanupTempFiles(filePaths) {
  filePaths.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        /* console.log(`✅ Cleaned up temp file: ${filePath}`); */
      } else {
        console.log(`⚠️ Temp file already removed: ${filePath}`);
      }
    } catch (error) {
      console.warn(`❌ Failed to cleanup temp file ${filePath}:`, error.message);
    }
  });
}

/**
 * Get file info for database storage
 */
function getFileInfo(filePath, fileName, fileType, orderNumber) {
  const stats = fs.statSync(filePath);
  const logicalPath = buildLogicalPath(orderNumber, fileType, fileName);
  
  return {
    path: filePath,
    name: fileName,
    size: stats.size,
    type: fileType,
    logicalPath,
    created: new Date()
  };
}

module.exports = {
  UPLOADS_BASE_DIR,
  ensureOrderFolders,
  ensureMediaSubfolders,
  copyFileToFolder,
  copyMultipleFilesToFolder,
  buildLogicalPath,
  cleanupTempFiles,
  getFileInfo,
  ensureDirectoryExists
};
