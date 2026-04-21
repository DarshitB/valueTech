const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const {
  ensureOrderFolders,
  ensureMediaSubfolders,
  copyMultipleFilesToFolder,
  cleanupTempFiles
} = require('../../utils/localFileHelper');
const { insertMedia, getOrderByNumber } = require('../../models/fieldVerifier/order_media');
const Order = require('../../models/orders/order');
const OrderStatusHistory = require('../../models/orders/orderStatusHistory');
const { BadRequestError, NotFoundError } = require('../../utils/customErrors');
const { generateAndSaveThumbnail } = require('../../utils/thumbnailHelper');
const { burnTextOnVideo, normalizeVideoExt } = require('../../utils/videoOverlayHelper');
const db = require("../../../db");

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
 * Helper: Update order status to 7 (Assets Submitted) after successful upload
 */
async function updateOrderStatusToAssetsSubmitted(orderId, verifierId, imageCount = 0) {
  try {
    // Direct query to check if date_of_inspection is already set
    const currentOrder = await db('orders')
      .select('date_of_inspection')
      .where('id', orderId)
      .first();
    
    // Prepare update data
    const updateData = {
      current_status_id: 7,
      updated_at: new Date(),
      updated_by: verifierId
    };
    
    // Only set date_of_inspection if it's null/empty
    if (!currentOrder || !currentOrder.date_of_inspection) {
      updateData.date_of_inspection = new Date();
    }

    // Update order status to 7 (Assets Submitted)
    await Order.updateOrder(orderId, updateData);

    // Create status history entry
    const statusHistoryData = {
      order_id: orderId,
      status_id: 7, // Assets Submitted
      user_type: 'field_verifier',
      changed_by: verifierId,
      changed_at: new Date(),
      activity_extra: `${imageCount} file(s) Uploaded`
    };

    await OrderStatusHistory.createStatusHistory(statusHistoryData);
  } catch (error) {
    console.error('Error updating order status:', error);
    // Don't throw error here as upload was successful
  }
}

/**
 * POST /api/media/upload-multipart
 * Accepts multipart form data with files and order_number
 */
async function uploadMultipart(req, res, next) {
  let tempPaths = [];
  let finalUploadedPaths = [];
  try {
    const { order_number, image_count, video_count, overlay_text } = req.body;
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

    if (!order_number) throw new BadRequestError('order_number is required');
    if (!files || !Array.isArray(files) || files.length === 0)
      throw new BadRequestError('No files uploaded');

    // Enforce "all or nothing" based on expected image/video counts
    // If counts are not provided, treat them as 0
    const expectedImageCount = parseInt(image_count ?? 0, 10);
    const expectedVideoCount = parseInt(video_count ?? 0, 10);

    if (
      Number.isNaN(expectedImageCount) ||
      Number.isNaN(expectedVideoCount) ||
      expectedImageCount < 0 ||
      expectedVideoCount < 0
    ) {
      throw new BadRequestError(
        'image_count and video_count must be non-negative integers'
      );
    }

    const actualImageCount = files.filter(
      (f) => f.mimetype && f.mimetype.startsWith('image/')
    ).length;
    const actualVideoCount = files.filter(
      (f) => f.mimetype && f.mimetype.startsWith('video/')
    ).length;

    if (
      actualImageCount !== expectedImageCount ||
      actualVideoCount !== expectedVideoCount
    ) {
      throw new BadRequestError(
        `Uploaded files count does not match expected image_count/video_count. ` +
          `image_count_from_api=${expectedImageCount}, actual_images=${actualImageCount}, ` +
          `video_count_from_api=${expectedVideoCount}, actual_videos=${actualVideoCount}`
      );
    }

    const orderRow = await getOrderByNumber(order_number);
    if (!orderRow) throw new BadRequestError('Order not found with provided order_number');

    // Check if order already has images/videos and update rejected ones (status 2 -> 3)
    const existingMedia = await db('order_media_image_video')
      .where('order_id', orderRow.id)
      .where('status', 2);
    
    if (existingMedia.length > 0) {
      // Update all rejected media (status 2) to status 3
      await db('order_media_image_video')
        .where('order_id', orderRow.id)
        .where('status', 2)
        .update({ status: 3 });
    }

    // Ensure order folders (this is now cached and optimized)
    const { orderPath } = await ensureOrderFolders(order_number);
    const { imagesPath, videosPath } = await ensureMediaSubfolders(orderPath);

    // Prepare all files for parallel upload
    const shouldOverlay = overlay_text && overlay_text.trim().length > 0;
    const filesToUpload = await Promise.all(
      files.map(async (f) => {
        const fileType = f.mimetype.startsWith('video') ? 'video' : 'image';
        const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const extension = f.originalname.split('.').pop() || 'bin';
        const generatedFilename = `${order_number}_${fileType}_${randomNumber}.${extension}`;
        const targetFolderPath =
          f.mimetype && f.mimetype.startsWith('video') ? videosPath : imagesPath;

        // Always track the original multer temp file for cleanup
        tempPaths.push(f.path);

        // For videos with overlay_text: burn the text in before copying to final folder
        let sourcePath = f.path;
        if (fileType === 'video' && shouldOverlay) {
          const overlayPath = await burnTextOnVideo(f.path, overlay_text.trim(), extension);
          tempPaths.push(overlayPath); // track overlay temp for cleanup too
          sourcePath = overlayPath;
        }

        return {
          path: sourcePath,
          name: generatedFilename,
          mimeType: f.mimetype,
          targetFolderPath,
          fileType,
        };
      })
    );

    // Copy all files to target folders in parallel for maximum performance
    const uploadedFiles = await copyMultipleFilesToFolder(filesToUpload);
    finalUploadedPaths = uploadedFiles.map((u) => u.path);

    // Generate thumbnails for images in parallel
    const thumbnailPromises = filesToUpload
      .map((f, i) => (f.fileType === 'image' ? uploadedFiles[i].path : null))
      .filter(Boolean)
      .map((p) => generateAndSaveThumbnail(p));
    await Promise.all(thumbnailPromises);

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
    const saved = await Promise.all(
      mediaRecords.map(async (record, i) => {
        const mediaId = await insertMedia(record);
        return {
          id: mediaId,
          localFileId: uploadedFiles[i].id,
          link: uploadedFiles[i].webContentLink, // Use local file path for media access
          filename: filesToUpload[i].name,
        };
      })
    );

    // Final safety check: ensure we saved exactly as many as expected
    if (
      uploadedFiles.length !== files.length ||
      saved.length !== files.length
    ) {
      throw new Error(
        'Mismatch between expected and saved media records; rolling back this upload'
      );
    }

    // Cleanup temp files
    /* console.log(`🧹 Cleaning up ${tempPaths.length} temporary files...`); */
    cleanupTempFiles(tempPaths);

    // Update order status to 7 (Assets Submitted) after successful upload
    await updateOrderStatusToAssetsSubmitted(orderRow.id, id, filesToUpload.length);

    res.json({
      state: 1,
      message: 'successfully uploaded the images',
      files: saved,
    });
  } catch (err) {
    // If there's an error, still try to cleanup temp files and any copied files
    console.error('uploadMultipart error:', err);
    const allPathsToCleanup = [
      ...(tempPaths || []),
      ...(finalUploadedPaths || []),
    ];
    if (allPathsToCleanup.length > 0) {
      cleanupTempFiles(allPathsToCleanup);
    }
    next(err);
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
async function uploadBase64(req, res, next) {
  let tempPaths = [];
  let finalUploadedPaths = [];
  try {
    const { order_number, files, image_count, video_count, overlay_text } = req.body;
    const { id } = req.verifier;

    if (!order_number) throw new BadRequestError('order_number is required');
    if (!files || !Array.isArray(files) || files.length === 0)
      throw new BadRequestError('No files in payload');

    // Enforce "all or nothing" based on expected image/video counts
    // If counts are not provided, treat them as 0
    const expectedImageCount = parseInt(image_count ?? 0, 10);
    const expectedVideoCount = parseInt(video_count ?? 0, 10);

    if (
      Number.isNaN(expectedImageCount) ||
      Number.isNaN(expectedVideoCount) ||
      expectedImageCount < 0 ||
      expectedVideoCount < 0
    ) {
      throw new BadRequestError(
        'image_count and video_count must be non-negative integers'
      );
    }

    /* console.log("files", files); */

    // Validate counts against the raw files array BEFORE deduplication so that
    // image_count/video_count always reflects what the client says it is sending.
    const rawImageCount = files.filter(
      (f) => f.data && /^data:image\//.test(f.data)
    ).length;
    const rawVideoCount = files.filter(
      (f) => f.data && /^data:video\//.test(f.data)
    ).length;

    if (
      rawImageCount !== expectedImageCount ||
      rawVideoCount !== expectedVideoCount
    ) {
      throw new BadRequestError(
        `Uploaded files count does not match expected image_count/video_count. ` +
          `image_count_from_api=${expectedImageCount}, actual_images=${rawImageCount}, ` +
          `video_count_from_api=${expectedVideoCount}, actual_videos=${rawVideoCount}`
      );
    }

    const orderRow = await getOrderByNumber(order_number);
    if (!orderRow) throw new BadRequestError('Order not found with provided order_number');

    // Check if order already has images/videos and update rejected ones (status 2 -> 3)
    const existingMedia = await db('order_media_image_video')
      .where('order_id', orderRow.id)
      .where('status', 2);
    
    if (existingMedia.length > 0) {
      // Update all rejected media (status 2) to status 3
      await db('order_media_image_video')
        .where('order_id', orderRow.id)
        .where('status', 2)
        .update({ status: 3 });
    }

    // Ensure order folders (this is now cached and optimized)
    const { orderPath } = await ensureOrderFolders(order_number);
    const { imagesPath, videosPath } = await ensureMediaSubfolders(orderPath);

    // Prepare all files for parallel upload — skip exact duplicates within this request.
    // Two files are considered identical when their raw base64 payload (after the
    // "data:<mime>;base64," prefix) produces the same SHA-256 hash.
    const filesToUpload = [];
    const seenHashes = new Set();
    let duplicatesSkipped = 0;
    const shouldOverlay = overlay_text && overlay_text.trim().length > 0;

    for (const item of files) {
      if (!item.data) continue;

      // Extract just the base64 payload for hashing (ignore mime prefix)
      const hashMatch = item.data.match(/^data:.+;base64,(.+)$/);
      if (!hashMatch) continue;

      const contentHash = crypto
        .createHash('sha256')
        .update(hashMatch[1])
        .digest('hex');

      if (seenHashes.has(contentHash)) {
        duplicatesSkipped++;
        continue; // identical file already queued — skip
      }
      seenHashes.add(contentHash);

      const { tmpPath, mime } = writeBase64ToTemp(item.data);
      const fileType = mime.startsWith('video') ? 'video' : 'image';
      const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const rawExt = mime.split('/')[1] || 'bin';
      const extension = fileType === 'video' ? normalizeVideoExt(rawExt) : rawExt;
      const generatedFilename = `${order_number}_${fileType}_${randomNumber}.${extension}`;
      const targetFolderPath = mime && mime.startsWith('video') ? videosPath : imagesPath;

      // Always track the base64-decoded temp file for cleanup
      tempPaths.push(tmpPath);

      // For videos with overlay_text: burn the text in before copying to final folder
      let sourcePath = tmpPath;
      if (fileType === 'video' && shouldOverlay) {
        const overlayPath = await burnTextOnVideo(tmpPath, overlay_text.trim(), extension);
        tempPaths.push(overlayPath); // track overlay temp for cleanup too
        sourcePath = overlayPath;
      }

      filesToUpload.push({
        path: sourcePath,
        name: generatedFilename,
        mimeType: mime,
        targetFolderPath,
        fileType,
      });
    }

    // Copy all files to target folders in parallel for maximum performance
    const uploadedFiles = await copyMultipleFilesToFolder(filesToUpload);
    finalUploadedPaths = uploadedFiles.map((u) => u.path);

    // Generate thumbnails for images in parallel
    const thumbnailPromises = filesToUpload
      .map((f, i) => (f.fileType === 'image' ? uploadedFiles[i].path : null))
      .filter(Boolean)
      .map((p) => generateAndSaveThumbnail(p));
    await Promise.all(thumbnailPromises);

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
        filename: filesToUpload[i].name,
      });
    }

    // Final safety check: ensure we saved exactly as many as expected
    if (
      uploadedFiles.length !== filesToUpload.length ||
      saved.length !== filesToUpload.length
    ) {
      throw new Error(
        'Mismatch between expected and saved media records; rolling back this upload'
      );
    }

    // Cleanup temp files ONLY after successful database insertion
   /*  console.log(`🧹 Cleaning up ${tempPaths.length} temporary files...`); */
    cleanupTempFiles(tempPaths);

    // Update order status to 7 (Assets Submitted) after successful upload
    await updateOrderStatusToAssetsSubmitted(orderRow.id, id, filesToUpload.length);

    res.json({
      state: 1,
      message: 'successfully uploaded the images',
      files: saved,
      duplicates_skipped: duplicatesSkipped,
    });
  } catch (err) {
    // If there's an error, still try to cleanup temp files and any copied files
    console.error('uploadBase64 error:', err);
    const allPathsToCleanup = [
      ...(tempPaths || []),
      ...(finalUploadedPaths || []),
    ];
    if (allPathsToCleanup.length > 0) {
      cleanupTempFiles(allPathsToCleanup);
    }
    next(err);
  }
}

/**
 * POST /api/media/upload-combined
 *
 * Accepts EITHER:
 *   - multipart/form-data with files in any field name + body fields
 *     (order_number, image_count, video_count, overlay_text) and optionally
 *     a body field named `files` containing a JSON array of base64 items
 *     `[{ "data": "data:<mime>;base64,..." }, ...]` — this is how you send
 *     a MIX of multipart files AND base64 files in the same request.
 *   - application/json with a pure base64 payload identical to `/upload-base64`:
 *     { order_number, image_count, video_count, overlay_text,
 *       files: [{ data: "data:<mime>;base64,..." }, ...] }
 *
 * Count check (image_count / video_count) is validated against the TOTAL of
 * multipart + base64 files combined. Dedup is applied across ALL files in the
 * request (multipart + base64) by SHA-256 of the raw bytes so the same photo
 * sent in both channels is saved only once.
 */
async function uploadCombined(req, res, next) {
  let tempPaths = [];
  let finalUploadedPaths = [];
  try {
    const { order_number, image_count, video_count, overlay_text } = req.body || {};
    const { id } = req.verifier;

    // Initial debug: run before any parsing/validation conditions so we can
    // inspect incoming payload even when request fails early.
    console.log("[upload-combined] initial payload debug", {
      content_type: req.headers?.["content-type"] || null,
      body_keys: req.body ? Object.keys(req.body) : [],
      has_files_base64_key:
        !!(req.body && req.body.files_base64 !== undefined && req.body.files_base64 !== null),
      files_base64_raw_type:
        req.body && req.body.files_base64 !== undefined && req.body.files_base64 !== null
          ? Array.isArray(req.body.files_base64)
            ? "array"
            : typeof req.body.files_base64
          : "missing",
      files_base64_raw_prefix:
        req.body && typeof req.body.files_base64 === "string"
          ? req.body.files_base64.slice(0, 120)
          : null,
      multipart_files_count: Array.isArray(req.files) ? req.files.length : 0,
    });

    // Collect multipart files (populated by multer when Content-Type is
    // multipart/form-data; empty array when payload is pure JSON).
    const multipartFiles = Array.isArray(req.files) ? req.files : [];

    // Collect base64 entries. Two accepted body field names so the caller can
    // avoid a naming collision with multipart file parts in Postman etc.:
    //   - `files_base64` (preferred when multipart files are also named `files`)
    //   - `files` (kept for backward compatibility; in pure JSON payloads this
    //     is the natural key because there are no multipart parts)
    // In multipart the value arrives as a JSON string; in pure JSON it arrives
    // as an array directly.
    let base64Files = [];
    const base64Source =
      req.body && req.body.files_base64 !== undefined && req.body.files_base64 !== null
        ? req.body.files_base64
        : req.body && req.body.files !== undefined && req.body.files !== null
        ? req.body.files
        : null;
    if (base64Source !== null) {
      if (Array.isArray(base64Source)) {
        base64Files = base64Source;
      } else if (typeof base64Source === 'string' && base64Source.trim().length > 0) {
        try {
          const parsed = JSON.parse(base64Source);
          base64Files = Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          throw new BadRequestError(
            'files / files_base64 field must be a valid JSON array of { data: "data:<mime>;base64,..." } items'
          );
        }
      }
    }

    // Debug: inspect files_base64 payload shape for upload-combined endpoint.
    // Keeps logs compact (does not print full base64 content).
    console.log("[upload-combined] files_base64 debug", {
      has_files_base64_key:
        !!(req.body && req.body.files_base64 !== undefined && req.body.files_base64 !== null),
      files_base64_source_type: base64Source === null ? "null" : Array.isArray(base64Source) ? "array" : typeof base64Source,
      parsed_base64_items_count: base64Files.length,
      first_item_keys:
        base64Files.length > 0 && base64Files[0] && typeof base64Files[0] === "object"
          ? Object.keys(base64Files[0])
          : [],
      first_item_data_prefix:
        base64Files.length > 0 &&
        base64Files[0] &&
        typeof base64Files[0].data === "string"
          ? base64Files[0].data.slice(0, 48)
          : null,
    });

    if (!order_number) throw new BadRequestError('order_number is required');
    if (multipartFiles.length === 0 && base64Files.length === 0) {
      throw new BadRequestError(
        'No files uploaded (provide multipart files, base64 files, or both)'
      );
    }

    // Enforce "all or nothing" count check against the COMBINED totals.
    const expectedImageCount = parseInt(image_count ?? 0, 10);
    const expectedVideoCount = parseInt(video_count ?? 0, 10);

    if (
      Number.isNaN(expectedImageCount) ||
      Number.isNaN(expectedVideoCount) ||
      expectedImageCount < 0 ||
      expectedVideoCount < 0
    ) {
      throw new BadRequestError(
        'image_count and video_count must be non-negative integers'
      );
    }

    const multipartImageCount = multipartFiles.filter(
      (f) => f.mimetype && f.mimetype.startsWith('image/')
    ).length;
    const multipartVideoCount = multipartFiles.filter(
      (f) => f.mimetype && f.mimetype.startsWith('video/')
    ).length;
    const base64ImageCount = base64Files.filter(
      (f) => f && f.data && /^data:image\//.test(f.data)
    ).length;
    const base64VideoCount = base64Files.filter(
      (f) => f && f.data && /^data:video\//.test(f.data)
    ).length;

    const actualImageCount = multipartImageCount + base64ImageCount;
    const actualVideoCount = multipartVideoCount + base64VideoCount;

    if (
      actualImageCount !== expectedImageCount ||
      actualVideoCount !== expectedVideoCount
    ) {
      throw new BadRequestError(
        `Uploaded files count does not match expected image_count/video_count. ` +
          `image_count_from_api=${expectedImageCount}, actual_images=${actualImageCount} ` +
          `(multipart=${multipartImageCount}, base64=${base64ImageCount}), ` +
          `video_count_from_api=${expectedVideoCount}, actual_videos=${actualVideoCount} ` +
          `(multipart=${multipartVideoCount}, base64=${base64VideoCount})`
      );
    }

    const orderRow = await getOrderByNumber(order_number);
    if (!orderRow) throw new BadRequestError('Order not found with provided order_number');

    // Existing rejected-media status transition (2 -> 3) — same as other endpoints.
    const existingMedia = await db('order_media_image_video')
      .where('order_id', orderRow.id)
      .where('status', 2);

    if (existingMedia.length > 0) {
      await db('order_media_image_video')
        .where('order_id', orderRow.id)
        .where('status', 2)
        .update({ status: 3 });
    }

    const { orderPath } = await ensureOrderFolders(order_number);
    const { imagesPath, videosPath } = await ensureMediaSubfolders(orderPath);

    const shouldOverlay =
      overlay_text && String(overlay_text).trim().length > 0;

    // Unified processing pipeline. Dedup is applied across BOTH multipart and
    // base64 files so the same photo sent in both channels is kept only once.
    const filesToUpload = [];
    const seenHashes = new Set();
    let duplicatesSkipped = 0;

    // 1) Multipart files — hash file bytes on disk to detect duplicates.
    for (const f of multipartFiles) {
      if (!f || !f.mimetype || !f.path) continue;

      let contentHash = null;
      try {
        const fileBuffer = fs.readFileSync(f.path);
        contentHash = crypto
          .createHash('sha256')
          .update(fileBuffer)
          .digest('hex');
      } catch (_) {
        contentHash = null;
      }

      if (contentHash && seenHashes.has(contentHash)) {
        tempPaths.push(f.path); // still cleanup the multer temp file
        duplicatesSkipped++;
        continue;
      }
      if (contentHash) seenHashes.add(contentHash);

      const fileType = f.mimetype.startsWith('video') ? 'video' : 'image';
      const randomNumber = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
      const rawExt =
        (f.originalname && f.originalname.split('.').pop()) ||
        (f.mimetype.split('/')[1] || 'bin');
      const extension =
        fileType === 'video' ? normalizeVideoExt(rawExt) : rawExt;
      const generatedFilename = `${order_number}_${fileType}_${randomNumber}.${extension}`;
      const targetFolderPath = fileType === 'video' ? videosPath : imagesPath;

      tempPaths.push(f.path);

      let sourcePath = f.path;
      if (fileType === 'video' && shouldOverlay) {
        const overlayPath = await burnTextOnVideo(
          f.path,
          String(overlay_text).trim(),
          extension
        );
        tempPaths.push(overlayPath);
        sourcePath = overlayPath;
      }

      filesToUpload.push({
        path: sourcePath,
        name: generatedFilename,
        mimeType: f.mimetype,
        targetFolderPath,
        fileType,
      });
    }

    // 2) Base64 files — same dedup logic as /upload-base64.
    for (const item of base64Files) {
      if (!item || !item.data) continue;

      const hashMatch = item.data.match(/^data:.+;base64,(.+)$/);
      if (!hashMatch) continue;

      const contentHash = crypto
        .createHash('sha256')
        .update(hashMatch[1])
        .digest('hex');

      if (seenHashes.has(contentHash)) {
        duplicatesSkipped++;
        continue;
      }
      seenHashes.add(contentHash);

      const { tmpPath, mime } = writeBase64ToTemp(item.data);
      const fileType = mime.startsWith('video') ? 'video' : 'image';
      const randomNumber = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
      const rawExt = mime.split('/')[1] || 'bin';
      const extension =
        fileType === 'video' ? normalizeVideoExt(rawExt) : rawExt;
      const generatedFilename = `${order_number}_${fileType}_${randomNumber}.${extension}`;
      const targetFolderPath = mime.startsWith('video') ? videosPath : imagesPath;

      tempPaths.push(tmpPath);

      let sourcePath = tmpPath;
      if (fileType === 'video' && shouldOverlay) {
        const overlayPath = await burnTextOnVideo(
          tmpPath,
          String(overlay_text).trim(),
          extension
        );
        tempPaths.push(overlayPath);
        sourcePath = overlayPath;
      }

      filesToUpload.push({
        path: sourcePath,
        name: generatedFilename,
        mimeType: mime,
        targetFolderPath,
        fileType,
      });
    }

    if (filesToUpload.length === 0) {
      throw new BadRequestError(
        'All provided files were duplicates or invalid; nothing to upload'
      );
    }

    // Copy everything to its final folder in parallel.
    const uploadedFiles = await copyMultipleFilesToFolder(filesToUpload);
    finalUploadedPaths = uploadedFiles.map((u) => u.path);

    // Thumbnails for images (same behaviour as other endpoints).
    const thumbnailPromises = filesToUpload
      .map((f, i) => (f.fileType === 'image' ? uploadedFiles[i].path : null))
      .filter(Boolean)
      .map((p) => generateAndSaveThumbnail(p));
    await Promise.all(thumbnailPromises);

    const mediaRecords = uploadedFiles.map((uploaded, index) => ({
      order_id: orderRow.id,
      uploader_type: 'field_verifiers',
      uploader_id: id,
      media_url: uploaded.webContentLink,
      media_type: filesToUpload[index].fileType,
      status: 0,
    }));

    const saved = [];
    for (let i = 0; i < mediaRecords.length; i++) {
      const mediaId = await insertMedia(mediaRecords[i]);
      saved.push({
        id: mediaId,
        localFileId: uploadedFiles[i].id,
        link: uploadedFiles[i].webContentLink,
        filename: filesToUpload[i].name,
      });
    }

    if (
      uploadedFiles.length !== filesToUpload.length ||
      saved.length !== filesToUpload.length
    ) {
      throw new Error(
        'Mismatch between expected and saved media records; rolling back this upload'
      );
    }

    cleanupTempFiles(tempPaths);

    await updateOrderStatusToAssetsSubmitted(
      orderRow.id,
      id,
      filesToUpload.length
    );

    res.json({
      state: 1,
      message: 'successfully uploaded the images',
      files: saved,
      duplicates_skipped: duplicatesSkipped,
      sources: {
        multipart: multipartFiles.length,
        base64: base64Files.length,
      },
    });
  } catch (err) {
    console.error('uploadCombined error:', err);
    const allPathsToCleanup = [
      ...(tempPaths || []),
      ...(finalUploadedPaths || []),
    ];
    if (allPathsToCleanup.length > 0) {
      cleanupTempFiles(allPathsToCleanup);
    }
    next(err);
  }
}

module.exports = {
  uploadMultipart,
  uploadBase64,
  uploadCombined,
};
