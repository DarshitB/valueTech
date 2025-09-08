const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const {
  ensureOrderFolders,
  ensureMediaSubfolders,
  copyMultipleFilesToFolder,
  cleanupTempFiles
} = require('../../utils/localFileHelper');
const { insertMedia, getOrderByNumber } = require('../../models/fieldVerifier/order_media');

/**
 * Helper: write base64 data to temp file and return path + filename
 */
function writeBase64ToTemp(dataUrl) {
  // dataUrl: "data:<mime>;base64,<data>"
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid base64 data URL');

  const mime = matches[1];
  const base64 = matches[2];
  const ext = mime.split('/')[1] || 'bin';
  const filename = `${uuidv4()}-temp.${ext}`;
  const tmpPath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));
  return { tmpPath, filename, mime };
}

/**
 * POST /api/media/upload-multipart
 * Accepts multipart form data with files and order_number
 */
async function uploadMultipart(req, res) {
  try {
    const { order_number } = req.body;
    const files = req.files;
    const { id } = req.verifier;

    // Debug logging to help identify the issue
   /*  console.log('📁 Upload request received:');
    console.log('📋 Body fields:', Object.keys(req.body));
    console.log('📁 Files received:', files ? files.length : 'No files');
    if (files && files.length > 0) {
      console.log('📋 First file fieldname:', files[0].fieldname);
      console.log('📋 First file mimetype:', files[0].mimetype);
    } */

    if (!order_number) return res.status(400).json({ error: 'order_number is required' });
    if (!files || !Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const orderRow = await getOrderByNumber(order_number);
    if (!orderRow) return res.status(400).json({ error: 'Order not found with provided order_number' });

    // Ensure order folders (this is now cached and optimized)
    const { orderPath } = await ensureOrderFolders(order_number);
    const { imagesPath, videosPath } = await ensureMediaSubfolders(orderPath);

    // Prepare all files for parallel upload
    const filesToUpload = [];
    const tempPaths = [];

    for (const f of files) {
      // Generate filename: orderNumber_fileType_randomNumber.extension
      const fileType = f.mimetype.startsWith('video') ? 'video' : 'image';
      const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const extension = f.originalname.split('.').pop() || 'bin';
      const generatedFilename = `${order_number}_${fileType}_${randomNumber}.${extension}`;

      // Choose target folder path
      const targetFolderPath = f.mimetype && f.mimetype.startsWith('video') ? videosPath : imagesPath;

      filesToUpload.push({
        path: f.path,
        name: generatedFilename,
        mimeType: f.mimetype,
        targetFolderPath: targetFolderPath,
        fileType: f.mimetype.startsWith('video') ? 'video' : 'image'
      });

      tempPaths.push(f.path);
    }

    // Copy all files to target folders in parallel for maximum performance
    const uploadedFiles = await copyMultipleFilesToFolder(filesToUpload);

    // Prepare database records for batch insertion
    const mediaRecords = uploadedFiles.map((uploaded, index) => {
      const fileInfo = filesToUpload[index];
      
      return {
        order_id: orderRow.id,
        uploader_type: 'field_verifiers',
        uploader_id: id,
        media_url: uploaded.webContentLink, // Use local file path for media access
        media_type: fileInfo.fileType,
        status: 0,
      };
    });

    // Insert all media records
    const saved = [];
    for (let i = 0; i < mediaRecords.length; i++) {
      const mediaId = await insertMedia(mediaRecords[i]);
      saved.push({
        id: mediaId,
        localFileId: uploadedFiles[i].id,
        link: uploadedFiles[i].webContentLink, // Use local file path for media access
        filename: filesToUpload[i].name
      });
    }

    // Cleanup temp files
    /* console.log(`🧹 Cleaning up ${tempPaths.length} temporary files...`); */
    cleanupTempFiles(tempPaths);

    res.json({ success: true, files: saved });
  } catch (err) {
    // If there's an error, still try to cleanup temp files
    console.error('uploadMultipart error:', err);
    if (tempPaths && tempPaths.length > 0) {
      /* console.log(`🧹 Error occurred, cleaning up ${tempPaths.length} temp files...`); */
      cleanupTempFiles(tempPaths);
    }
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/media/upload-base64
 * Accepts JSON:
 *  {
 *    order_number: "ORD123",
 *    files: [
 *      { data: "data:image/jpeg;base64,...." },
 *      ...
 *    ]
 *  }
 */
async function uploadBase64(req, res) {
  try {
    const { order_number, files } = req.body;
    const { id } = req.verifier;

    if (!order_number) return res.status(400).json({ error: 'order_number is required' });
    if (!files || !Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'No files in payload' });

    const orderRow = await getOrderByNumber(order_number);
    if (!orderRow) return res.status(400).json({ error: 'Order not found with provided order_number' });

    // Ensure order folders (this is now cached and optimized)
    const { orderPath } = await ensureOrderFolders(order_number);
    const { imagesPath, videosPath } = await ensureMediaSubfolders(orderPath);

    // Prepare all files for parallel upload
    const filesToUpload = [];
    const tempPaths = [];

    for (const item of files) {
      if (!item.data) continue;
      
      // Generate filename: orderNumber_fileType_randomNumber.extension
      const { tmpPath, filename, mime } = writeBase64ToTemp(item.data);
      const fileType = mime.startsWith('video') ? 'video' : 'image';
      const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const extension = mime.split('/')[1] || 'bin';
      const generatedFilename = `${order_number}_${fileType}_${randomNumber}.${extension}`;

      // Choose target folder path
      const targetFolderPath = mime && mime.startsWith('video') ? videosPath : imagesPath;

      filesToUpload.push({
        path: tmpPath,
        name: generatedFilename,
        mimeType: mime,
        targetFolderPath: targetFolderPath,
        fileType: mime.startsWith('video') ? 'video' : 'image'
      });

      tempPaths.push(tmpPath);
    }

    // Copy all files to target folders in parallel for maximum performance
    const uploadedFiles = await copyMultipleFilesToFolder(filesToUpload);

    // Prepare database records for batch insertion
    const mediaRecords = uploadedFiles.map((uploaded, index) => {
      const fileInfo = filesToUpload[index];
      
      return {
        order_id: orderRow.id,
        uploader_type: 'field_verifiers',
        uploader_id: id,
        media_url: uploaded.webContentLink, // Use local file path for media access
        media_type: fileInfo.fileType,
        status: 0,
      };
    });

    // Insert all media records in parallel (if your database supports it)
    const saved = [];
    for (let i = 0; i < mediaRecords.length; i++) {
      const mediaId = await insertMedia(mediaRecords[i]);
      saved.push({ 
        id: mediaId, 
        localFileId: uploadedFiles[i].id, 
        link: uploadedFiles[i].webContentLink, // Use local file path for media access
        filename: filesToUpload[i].name 
      });
    }

    // Cleanup temp files ONLY after successful database insertion
   /*  console.log(`🧹 Cleaning up ${tempPaths.length} temporary files...`); */
    cleanupTempFiles(tempPaths);

    res.json({ success: true, files: saved });
  } catch (err) {
    // If there's an error, still try to cleanup temp files
    console.error('uploadBase64 error:', err);
    if (tempPaths && tempPaths.length > 0) {
      /* console.log(`🧹 Error occurred, cleaning up ${tempPaths.length} temp files...`); */
      cleanupTempFiles(tempPaths);
    }
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  uploadMultipart,
  uploadBase64,
};
