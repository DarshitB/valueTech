const orderMediaPortal = require("../../models/orders/orderMediaPortal");
const orderMediaDocument = require("../../models/orders/orderMediaDocument");
const Order = require("../../models/orders/order");
const OrderStatusHistory = require("../../models/orders/orderStatusHistory");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const yauzl = require("yauzl");
const { v4: uuidv4 } = require("uuid");
const db = require("../../../db");
const { PROTECTED_ROLE } = require("../../constants/protectedRoles");
const {
  ensureOrderFolders,
  ensureMediaSubfolders,
  copyMultipleFilesToFolder,
  cleanupTempFiles,
} = require("../../utils/localFileHelper");
const {
  BadRequestError,
  NotFoundError,
  AppError,
} = require("../../utils/customErrors");
const {
  generateAndSaveThumbnail,
  getThumbnailUrl,
  getThumbnailUrlIfExistsUniversal,
} = require("../../utils/thumbnailHelper");

const VIEW_ALL_MEDIA_PERMISSION = "view_all_order_media_files";

async function hasPermission(roleId, roleName, permissionName) {
  if (!roleId || !permissionName) return false;
  if (roleName === PROTECTED_ROLE) return true;

  const permission = await db("permissions")
    .join("role_permissions", "permissions.id", "role_permissions.permission_id")
    .where({
      "permissions.name": permissionName,
      "role_permissions.role_id": roleId,
    })
    .whereNull("role_permissions.deleted_at")
    .first();

  return !!permission;
}

/**
 * Helper: Update order status to 8 (Assets Approved) when images are approved
 */
async function updateOrderStatusToAssetsApproved(orderId, userId) {
  try {
    // Update order status to 8 (Assets Approved)
    await Order.updateOrder(orderId, {
      current_status_id: 8,
      updated_at: new Date(),
      updated_by: userId,
    });

    // Create status history entry
    const statusHistoryData = {
      order_id: orderId,
      status_id: 8, // Assets Approved
      changed_by: userId,
      changed_at: new Date(),
    };

    await OrderStatusHistory.createStatusHistory(statusHistoryData);
  } catch (error) {
    console.error("Error updating order status to Assets Approved:", error);
    // Don't throw error here as media status update was successful
  }
}

/**
 * Helper: Update order status to 7 (Assets Submitted) when any media is rejected from portal
 */
async function updateOrderStatusToAssetsSubmittedOnReject(orderId, userId) {
  try {
    await Order.updateOrder(orderId, {
      current_status_id: 7,
      updated_at: new Date(),
      updated_by: userId,
    });

    const statusHistoryData = {
      order_id: orderId,
      status_id: 7, // Assets Submitted
      changed_by: userId,
      changed_at: new Date(),
      activity_extra: "Media rejected – reverted to Assets Submitted",
    };

    await OrderStatusHistory.createStatusHistory(statusHistoryData);
  } catch (error) {
    console.error("Error updating order status to 7 on media reject:", error);
  }
}

/**
 * Delete local storage file from media_url (/uploads/...)
 * Returns true only when a file actually existed and was removed.
 */
function deleteLocalFileByMediaUrl(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== "string") return false;

  const uploadsPrefix = "/uploads/";
  const idx = mediaUrl.indexOf(uploadsPrefix);
  if (idx === -1) return false;

  const relativeUploadPath = mediaUrl.slice(idx + 1); // remove leading slash
  const absolutePath = path.join(process.cwd(), relativeUploadPath.replace(/\//g, path.sep));

  if (!fs.existsSync(absolutePath)) return false;

  fs.unlinkSync(absolutePath);
  return true;
}

/**
 * GET /api/portal/order-media/:orderId
 * Get all media records for a specific order
 */
async function getOrderMedia(req, res, next) {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      throw new BadRequestError("Order ID is required");
    }

    // Validate order ID is a number
    const orderIdNum = parseInt(orderId);
    if (isNaN(orderIdNum)) {
      throw new BadRequestError("Invalid Order ID format");
    }

    // Check if order exists
    const order = await Order.findById(orderIdNum, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    // Permission-based visibility:
    // - with `view_all_order_media_files` => all media
    // - without it => status 1 and status 4 only
    const canViewAllMedia = await hasPermission(
      req.user?.role_id,
      req.user?.role_name,
      VIEW_ALL_MEDIA_PERMISSION
    );
    const mediaRecords = canViewAllMedia
      ? await orderMediaPortal.getMediaByOrderId(orderIdNum)
      : await orderMediaPortal.getApprovedAndTextMediaByOrderId(orderIdNum);
    const mediaWithThumbnails = await Promise.all(
      mediaRecords.map(async (record) => ({
        ...record,
        thumbnail_url:
          record.media_type === "image"
            ? await getThumbnailUrlIfExistsUniversal(record.media_url)
            : null,
      }))
    );

    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          order_number: order.order_number,
        },
        media: mediaWithThumbnails,
        total_count: mediaWithThumbnails.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/portal/order-media/status
 * Update status for multiple media records
 * Body: { updates: [{ id: 1, status: 1 }, { id: 2, status: 0 }] }
 */
async function updateMediaStatus(req, res, next) {
  try {
    const { updates } = req.body;
    const { id: userId } = req.user;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      throw new BadRequestError(
        "Updates array is required and must not be empty"
      );
    }

    // Validate each update object
    for (const update of updates) {
      if (!update.id || update.status === undefined) {
        throw new BadRequestError(
          "Each update must have 'id' and 'status' fields"
        );
      }

      // Validate status is a number (0, 1, or 2)
      if (![0, 1, 2].includes(update.status)) {
        throw new BadRequestError("Status must be 0, 1 or 2");
      }

      // Validate id is a number
      if (isNaN(parseInt(update.id))) {
        throw new BadRequestError("Invalid media ID format");
      }
    }

    // Update all media records
    const updatedRecordsArray = await orderMediaPortal.updateMultipleStatus(
      updates,
      userId
    );

    // Flatten the array of arrays to get actual records
    const updatedRecords = updatedRecordsArray.flat();

    // Check if any media was approved (status = 1) and update order status
    const hasApprovedMedia = updates.some((update) => update.status === 1);
    if (hasApprovedMedia && updatedRecords.length > 0) {
      const orderId = updatedRecords[0].order_id;
      if (orderId) {
        await updateOrderStatusToAssetsApproved(orderId, userId);
      }
    }

    // When any media is rejected (status = 2), set order current_status_id to 7
    const hasRejectedMedia = updates.some((update) => update.status === 2);
    if (hasRejectedMedia && updatedRecords.length > 0) {
      const orderId = updatedRecords[0].order_id;
      if (orderId) {
        await updateOrderStatusToAssetsSubmittedOnReject(orderId, userId);
      }
    }

    res.locals.id = updatedRecords[0]?.id;

    res.json({
      success: true,
      message: `Successfully updated ${updatedRecords.length} media records`,
      data: {
        updated_count: updatedRecords.length,
        updated_records: updatedRecords,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/portal/order-media/delete
 * Soft delete media records by setting deleted_at and deleted_by
 * Body: { ids: [1, 2, 3] }
 */
async function softDeleteMedia(req, res, next) {
  try {
    const { ids } = req.body;
    const { id: userId } = req.user;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestError("ids array is required and must not be empty");
    }

    const numericIds = ids.map((id) => parseInt(id, 10));
    if (numericIds.some((n) => Number.isNaN(n))) {
      throw new BadRequestError("Each id must be a valid number");
    }

    const updatedRecords = await orderMediaPortal.softDeleteByIds(numericIds, userId);
    const deletedIds = Array.isArray(updatedRecords) ? updatedRecords.map((r) => r.id) : [];

    res.json({
      success: true,
      message: `Successfully deleted ${deletedIds.length} media record(s)`,
      data: {
        deleted_count: deletedIds.length,
        deleted_ids: deletedIds,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/order-media/permanent-delete-soft-deleted
 * Permanently remove already soft-deleted media rows + their storage files.
 */
async function permanentDeleteSoftDeletedMedia(req, res, next) {
  try {
    const softDeletedRows = await orderMediaPortal.findSoftDeletedWithMediaUrl();

    if (!softDeletedRows || softDeletedRows.length === 0) {
      return res.json({
        success: true,
        message: "No soft-deleted media records found",
        data: {
          records_deleted_count: 0,
          files_removed_count: 0,
          thumbnails_removed_count: 0,
          total_rows_matched: 0,
        },
      });
    }

    let filesRemovedCount = 0;
    let thumbnailsRemovedCount = 0;
    for (const row of softDeletedRows) {
      try {
        if (deleteLocalFileByMediaUrl(row.media_url)) {
          filesRemovedCount += 1;
        }

        // Image thumbnails are stored separately under /thumbs; remove per-record thumbnail too.
        if (row.media_type === "image") {
          const thumbnailUrl = getThumbnailUrl(row.media_url);
          if (thumbnailUrl && deleteLocalFileByMediaUrl(thumbnailUrl)) {
            thumbnailsRemovedCount += 1;
          }
        }
      } catch (error) {
        // Continue with next file; DB cleanup should still proceed.
        console.warn(`Failed to remove media file for record ${row.id}:`, error.message);
      }
    }

    const ids = softDeletedRows.map((row) => row.id);
    const deletedCount = await orderMediaPortal.hardDeleteByIds(ids);

    res.json({
      success: true,
      message: `Permanently deleted ${deletedCount} media record(s)`,
      data: {
        total_rows_matched: softDeletedRows.length,
        records_deleted_count: deletedCount,
        files_removed_count: filesRemovedCount,
        thumbnails_removed_count: thumbnailsRemovedCount,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/portal/order-media/:orderId/count
 * Get count of media records for a specific order
 */
async function getOrderMediaCount(req, res, next) {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      throw new BadRequestError("Order ID is required");
    }

    // Validate order ID is a number
    const orderIdNum = parseInt(orderId);
    if (isNaN(orderIdNum)) {
      throw new BadRequestError("Invalid Order ID format");
    }

    // Check if order exists
    const order = await Order.findById(orderIdNum, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    // Get media count for the order
    const mediaRecords = await orderMediaPortal.getMediaByOrderId(orderIdNum);

    // Count by status
    const statusCounts = {
      pending: mediaRecords.filter((m) => m.status === 0).length,
      approved: mediaRecords.filter((m) => m.status === 1).length,
      total: mediaRecords.length,
    };

    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
        },
        media_counts: statusCounts,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Helper: Extract ZIP file and return array of extracted file paths
 */
function extractZipFile(zipPath, extractDir) {
  return new Promise((resolve, reject) => {
    const extractedFiles = [];

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        // Skip directories and non-media files
        if (
          entry.fileName.endsWith("/") ||
          !entry.fileName.match(
            /\.(jpg|jpeg|png|gif|bmp|webp|mp4|avi|mov|wmv|flv|webm)$/i
          )
        ) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) {
            zipfile.readEntry();
            return;
          }

          // Create safe filename
          const safeFileName = entry.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
          const extractPath = path.join(extractDir, safeFileName);

          // Ensure directory exists
          const extractDirPath = path.dirname(extractPath);
          if (!fs.existsSync(extractDirPath)) {
            fs.mkdirSync(extractDirPath, { recursive: true });
          }

          const writeStream = fs.createWriteStream(extractPath);

          readStream.pipe(writeStream);

          writeStream.on("close", () => {
            extractedFiles.push({
              originalName: entry.fileName,
              extractedPath: extractPath,
              size: entry.uncompressedSize,
            });
            zipfile.readEntry();
          });

          writeStream.on("error", (err) => {
            zipfile.readEntry();
          });
        });
      });

      zipfile.on("end", () => {
        resolve(extractedFiles);
      });

      zipfile.on("error", reject);
    });
  });
}

/**
 * Helper: Get file type from extension
 */
function getFileTypeFromExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const videoExts = [".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm"];
  const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];

  if (videoExts.includes(ext)) return "video";
  if (imageExts.includes(ext)) return "image";
  return "unknown";
}

/**
 * Helper: Get MIME type from extension
 */
function getMimeTypeFromExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".webm": "video/webm",
  };

  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * POST /api/portal/order-media/upload-zip
 * Upload ZIP file containing images and videos
 * Body: multipart form with 'zipFile' field and 'orderId' field
 */
async function uploadZip(req, res, next) {
  let tempPaths = [];
  let extractDir = null;

  try {
    const { orderId } = req.body;
    const zipFile = req.file; // Single ZIP file
    const { id: userId } = req.user;

    // Validation using custom error classes
    if (!orderId) {
      throw new BadRequestError("Order ID is required");
    }

    if (!zipFile) {
      throw new BadRequestError("ZIP file is required");
    }

    // Validate order ID is a number
    const orderIdNum = parseInt(orderId);
    if (isNaN(orderIdNum)) {
      throw new BadRequestError("Invalid Order ID format");
    }

    // Check if order exists
    const order = await Order.findById(orderIdNum, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    // Create temporary extraction directory
    extractDir = path.join(os.tmpdir(), `zip_extract_${uuidv4()}`);
    fs.mkdirSync(extractDir, { recursive: true });
    tempPaths.push(extractDir);

    // Extract ZIP file
    console.log(`📦 Extracting ZIP file: ${zipFile.originalname}`);
    const extractedFiles = await extractZipFile(zipFile.path, extractDir);

    if (extractedFiles.length === 0) {
      throw new BadRequestError(
        "No valid image or video files found in the ZIP"
      );
    }

    console.log(`📁 Extracted ${extractedFiles.length} files from ZIP`);

    // Ensure order folders
    const { orderPath } = await ensureOrderFolders(order.order_number);
    const { imagesPath, videosPath } = await ensureMediaSubfolders(orderPath);

    // Prepare files for upload
    const filesToUpload = [];
    const mediaRecords = [];

    for (const extractedFile of extractedFiles) {
      const fileType = getFileTypeFromExtension(extractedFile.originalName);

      if (fileType === "unknown") continue;

      // Generate filename: orderNumber_fileType_timestamp_uuid.extension (prevents conflicts)
      const timestamp = Date.now();
      const uniqueId = uuidv4().substring(0, 8);
      const extension = path.extname(extractedFile.originalName);
      const generatedFilename = `${order.order_number}_${fileType}_${timestamp}_${uniqueId}${extension}`;

      // Choose target folder path
      const targetFolderPath = fileType === "video" ? videosPath : imagesPath;

      filesToUpload.push({
        path: extractedFile.extractedPath,
        name: generatedFilename,
        mimeType: getMimeTypeFromExtension(extractedFile.originalName),
        targetFolderPath: targetFolderPath,
        fileType: fileType,
      });

      // Prepare database record
      mediaRecords.push({
        order_id: orderIdNum,
        uploader_type: 'portal_users', // Required field for order_media_image_video table
        uploader_id: userId,
        media_type: fileType,
        status: 0, // Pending approval
      });
    }

    if (filesToUpload.length === 0) {
      throw new BadRequestError(
        "No valid image or video files found in the ZIP"
      );
    }

    // Copy all files to target folders
    console.log(`📤 Uploading ${filesToUpload.length} files to order folders`);
    const uploadedFiles = await copyMultipleFilesToFolder(filesToUpload);

    // Generate thumbnails for images in parallel (non-blocking for upload flow)
    const thumbnailPromises = filesToUpload
      .map((f, i) => (f.fileType === "image" ? uploadedFiles[i].path : null))
      .filter(Boolean)
      .map((p) => generateAndSaveThumbnail(p));
    await Promise.all(thumbnailPromises);

    // Update media records with file paths and insert into database
    const savedMedia = [];
    for (let i = 0; i < mediaRecords.length; i++) {
      const mediaRecord = {
        ...mediaRecords[i],
        media_url: uploadedFiles[i].webContentLink,
      };

      const mediaId = await orderMediaPortal.insertMedia(mediaRecord);
      savedMedia.push({
        id: mediaId,
        filename: filesToUpload[i].name,
        media_type: mediaRecord.media_type,
        media_url: mediaRecord.media_url,
        status: mediaRecord.status,
      });
    }

    // Cleanup temporary files
    console.log(`🧹 Cleaning up temporary files...`);
    cleanupTempFiles(tempPaths);
    cleanupTempFiles([zipFile.path]); // Clean up the uploaded ZIP file

    // Update order status to 7 (Assets Submitted) and create status history entry
    try {
      // Direct query to check if date_of_inspection is already set
      const currentOrder = await db('orders')
        .select('date_of_inspection')
        .where('id', orderIdNum)
        .first();
      
      // Prepare update data
      const updateData = {
        current_status_id: 7, // Assets Submitted
        updated_at: new Date(),
        updated_by: userId,
      };
      
      // Only set date_of_inspection if it's null/empty
      if (!currentOrder || !currentOrder.date_of_inspection) {
        updateData.date_of_inspection = new Date();
      }

      // Update the order's current status
      await Order.updateOrder(orderIdNum, updateData);

      // Create status history entry for ZIP upload
      const statusHistoryData = {
        order_id: orderIdNum,
        status_id: 7, // Assets Submitted
        changed_by: userId,
        changed_at: new Date(),
        activity_extra: `${savedMedia.length} file(s) Uploaded via ZIP`,
      };

      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    } catch (error) {
      console.error("Error updating order status and creating status history:", error);
      // Don't throw error here as upload was successful
    }

    console.log(`✅ Successfully uploaded ${savedMedia.length} files from ZIP`);

    res.json({
      success: true,
      message: `Successfully uploaded ${savedMedia.length} files from ZIP`,
      data: {
        order: {
          id: order.id,
          order_number: order.order_number,
        },
        uploaded_files: savedMedia,
        total_count: savedMedia.length,
        summary: {
          images: savedMedia.filter((f) => f.media_type === "image").length,
          videos: savedMedia.filter((f) => f.media_type === "video").length,
        },
      },
    });
  } catch (error) {
    console.error("Error in uploadZip:", error);

    // Cleanup on error
    if (tempPaths && tempPaths.length > 0) {
      cleanupTempFiles(tempPaths);
    }
    if (req.file && req.file.path) {
      cleanupTempFiles([req.file.path]);
    }

    // Let the error handler middleware handle the error
    next(error);
  }
}

/**
 * GET /api/portal/order-media/public/:orderId
 * Public API to get only approved media records for a specific order (no authentication required)
 * Includes: images, videos, reports, and collages (all approved)
 */
async function getApprovedOrderMediaPublic(req, res, next) {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      throw new BadRequestError("Order ID is required");
    }

    // Validate order ID is a number
    const orderIdNum = parseInt(orderId);
    if (isNaN(orderIdNum)) {
      throw new BadRequestError("Invalid Order ID format");
    }

    const payload = await buildApprovedPublicMediaPayload(orderIdNum, {
      shareToken: null,
    });
    res.json({ success: true, data: payload });
  } catch (error) {
    next(error);
  }
}

async function getOrCreatePublicShareToken(orderId) {
  const existing = await db("order_public_share_links")
    .select("token")
    .where({ order_id: orderId, is_active: true })
    .first();
  if (existing?.token) return existing.token;

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = crypto.randomBytes(24).toString("hex");
    try {
      await db("order_public_share_links").insert({
        order_id: orderId,
        token,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
      return token;
    } catch (err) {
      if (err && err.code === "23505") continue; // unique conflict, retry token
      throw err;
    }
  }
  throw new AppError("Unable to generate public share token", 500);
}

async function resolveOrderIdFromShareToken(token) {
  const row = await db("order_public_share_links")
    .select("order_id")
    .where({ token, is_active: true })
    .first();
  return row?.order_id || null;
}

async function buildApprovedPublicMediaPayload(orderIdNum, { shareToken = null } = {}) {
  const order = await orderMediaPortal.getOrderById(orderIdNum);
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  const effectiveToken = shareToken || (await getOrCreatePublicShareToken(orderIdNum));

  const approvedMediaRecords = await orderMediaPortal.getApprovedMediaByOrderId(orderIdNum);
  const approvedWithThumbnails = await Promise.all(
    approvedMediaRecords.map(async (record) => ({
      ...record,
      view_url: `/api/order-media/public/share/${effectiveToken}/media/${record.id}/view`,
      thumbnail_url:
        record.media_type === "image"
          ? await getThumbnailUrlIfExistsUniversal(record.media_url)
          : null,
    }))
  );

  const approvedDocuments = await orderMediaDocument.findApprovedByOrderId(orderIdNum);
  const reportsAndCollages = approvedDocuments.filter(
    (doc) => doc.document_type === "report" || doc.document_type === "collage"
  );

  const formattedDocuments = reportsAndCollages.map((doc) => ({
    id: doc.id,
    order_id: doc.order_id,
    uploader_type: doc.created_type || "system",
    uploader_id: doc.created_by,
    media_url: doc.media_url,
    view_url: `/api/order-media/public/share/${effectiveToken}/document/${doc.id}/view`,
    media_type: doc.document_type,
    status: doc.status,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    updated_by: doc.updated_by,
    thumbnail_url: null,
  }));

  const allApprovedMedia = [...approvedWithThumbnails, ...formattedDocuments];
  allApprovedMedia.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return {
    order: {
      id: order.id,
      order_number: order.order_number,
    },
    share_token: effectiveToken,
    share_documents_url: `/public/share/${effectiveToken}/documents`,
    share_images_url: `/public/share/${effectiveToken}/images`,
    media: allApprovedMedia,
    total_count: allApprovedMedia.length,
    summary: {
      images: approvedMediaRecords.filter((m) => m.media_type === "image").length,
      videos: approvedMediaRecords.filter((m) => m.media_type === "video").length,
      reports: formattedDocuments.filter((d) => d.media_type === "report").length,
      collages: formattedDocuments.filter((d) => d.media_type === "collage").length,
    },
  };
}

/**
 * GET /api/order-media/public/share/:token
 * Public API using masked token instead of order id.
 */
async function getApprovedOrderMediaPublicByToken(req, res, next) {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) throw new BadRequestError("Token is required");

    const orderIdNum = await resolveOrderIdFromShareToken(token);
    if (!orderIdNum) throw new NotFoundError("Public share link not found");

    const payload = await buildApprovedPublicMediaPayload(orderIdNum, {
      shareToken: token,
    });
    res.json({ success: true, data: payload });
  } catch (error) {
    next(error);
  }
}

function resolveAbsolutePathFromMediaUrl(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;
  const uploadsPrefix = "/uploads/";
  const idx = mediaUrl.indexOf(uploadsPrefix);
  if (idx === -1) return null;
  const relativeUploadPath = mediaUrl.slice(idx + 1); // remove leading slash
  return path.join(process.cwd(), relativeUploadPath.replace(/\//g, path.sep));
}

function inferContentTypeFromUrl(mediaUrl) {
  const clean = String(mediaUrl || "").split("?")[0].toLowerCase();
  if (clean.endsWith(".pdf")) return "application/pdf";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".mp4")) return "video/mp4";
  if (clean.endsWith(".mov")) return "video/quicktime";
  if (clean.endsWith(".avi")) return "video/x-msvideo";
  if (clean.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}

/**
 * GET /api/order-media/public/:orderId/:kind/:id/view
 * Public proxy stream for approved media/document.
 */
async function viewApprovedMediaPublic(req, res, next) {
  try {
    const orderIdNum = parseInt(req.params.orderId, 10);
    const fileIdNum = parseInt(req.params.id, 10);
    const kind = String(req.params.kind || "").toLowerCase();

    if (Number.isNaN(orderIdNum) || Number.isNaN(fileIdNum)) {
      throw new BadRequestError("Invalid orderId or file id");
    }
    if (!["media", "document"].includes(kind)) {
      throw new BadRequestError("kind must be 'media' or 'document'");
    }

    const order = await orderMediaPortal.getOrderById(orderIdNum);
    if (!order) throw new NotFoundError("Order not found");

    let mediaUrl = null;
    if (kind === "media") {
      const media = await orderMediaPortal.findById(fileIdNum);
      if (!media || media.order_id !== orderIdNum || Number(media.status) !== 1) {
        throw new NotFoundError("Approved media not found");
      }
      mediaUrl = media.media_url;
    } else {
      const doc = await orderMediaDocument.findById(fileIdNum);
      const isApproved = String(doc?.status || "").toLowerCase() === "approved";
      const isAllowedType =
        doc?.document_type === "report" || doc?.document_type === "collage";
      if (!doc || doc.order_id !== orderIdNum || !isApproved || !isAllowedType) {
        throw new NotFoundError("Approved document not found");
      }
      mediaUrl = doc.media_url;
    }

    if (!mediaUrl || typeof mediaUrl !== "string") {
      throw new NotFoundError("Media URL not available");
    }

    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "public, max-age=300");

    if (/^https?:\/\//i.test(mediaUrl)) {
      const upstream = await fetch(mediaUrl);
      if (!upstream.ok) {
        throw new BadRequestError(
          `Unable to fetch source file (HTTP ${upstream.status})`
        );
      }
      const contentType =
        upstream.headers.get("content-type") || inferContentTypeFromUrl(mediaUrl);
      res.setHeader("Content-Type", contentType);
      const arrayBuffer = await upstream.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }

    const absolutePath = resolveAbsolutePathFromMediaUrl(mediaUrl);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      throw new NotFoundError("File not found on storage");
    }
    res.setHeader("Content-Type", inferContentTypeFromUrl(mediaUrl));
    return fs.createReadStream(absolutePath).pipe(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/order-media/public/share/:token/:kind/:id/view
 * Public proxy stream using masked share token.
 */
async function viewApprovedMediaPublicByToken(req, res, next) {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) throw new BadRequestError("Token is required");
    const orderIdNum = await resolveOrderIdFromShareToken(token);
    if (!orderIdNum) throw new NotFoundError("Public share link not found");

    req.params.orderId = String(orderIdNum);
    return viewApprovedMediaPublic(req, res, next);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOrderMedia,
  updateMediaStatus,
  softDeleteMedia,
  permanentDeleteSoftDeletedMedia,
  getOrderMediaCount,
  uploadZip,
  getApprovedOrderMediaPublic,
  getApprovedOrderMediaPublicByToken,
  viewApprovedMediaPublic,
  viewApprovedMediaPublicByToken,
  getOrCreatePublicShareToken,
};
