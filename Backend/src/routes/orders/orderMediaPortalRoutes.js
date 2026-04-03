const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const orderMediaPortalController = require("../../controllers/orders/orderMediaPortalController");
const auth = require("../../middleware/auth"); // Assuming you have auth middleware for portal
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Assuming you have before update logger middleware
const checkPermission = require("../../middleware/permission"); // Assuming you have permission middleware
const activityLogger = require("../../middleware/activityLogger"); // Assuming you have activity logger middleware
const permission = require("../../middleware/permission"); // Assuming you have permission middleware

// Configure multer for ZIP file uploads
const upload = multer({
  dest: path.join(__dirname, "..", "..", "tmp_uploads"),
  limits: { 
    fileSize: 300 * 1024 * 1024 // 300MB limit for ZIP files
  },
  fileFilter: (req, file, cb) => {
    // Only allow ZIP files
    if (file.mimetype === 'application/zip' || 
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'), false);
    }
  },
});

/**
 * GET /api/order-media/public/:orderId
 * Public API to get only approved media records (no authentication required)
 */
router.get(
  "/public/:orderId",
  orderMediaPortalController.getApprovedOrderMediaPublic
);

// Apply authentication middleware to all routes below
router.use(auth);

// Apply permission middleware if needed
// router.use(permission);

/**
 * GET /api/order-media/:orderId
 * Get all media records for a specific order
 */
router.get(
  "/:orderId",
  checkPermission("view_order_media_files"),
  orderMediaPortalController.getOrderMedia
);

/**
 * GET /api/order-media/:orderId/count
 * Get count of media records for a specific order
 */
router.get(
  "/:orderId/count",
  checkPermission("view_order_media_files"),
  orderMediaPortalController.getOrderMediaCount
);

/**
 * PATCH /api/order-media/status
 * Update status for multiple media records
 * Body: { updates: [{ id: 1, status: 1 }, { id: 2, status: 0 }] }
 */
router.patch(
  "/status",
  checkPermission("approve_reject_order_media_files"),
  beforeUpdateLogger("order_media_image_video", (req) => req.params.id),
  activityLogger("order_media_image_video", (req) => req.params.id),
  orderMediaPortalController.updateMediaStatus
);

/**
 * PATCH /api/order-media/delete
 * Soft delete media records by setting deleted_at and deleted_by
 * Body: { ids: [1, 2, 3] }
 */
router.patch(
  "/delete",
  checkPermission("delete_order_media_files"),
  activityLogger("order_media_image_video", (req) => { const ids = req.body.ids; if (ids && Array.isArray(ids) && ids.length > 0) { const n = parseInt(ids[0], 10); return Number.isNaN(n) ? null : n; } return null; }, "Order Media Deletion"),
  orderMediaPortalController.softDeleteMedia
);

/**
 * POST /api/order-media/upload-zip
 * Upload ZIP file containing images and videos
 * Body: multipart form with 'zipFile' field and 'orderId' field
 */
router.post(
  "/upload-zip",
  checkPermission("upload_order_media_files"),
  upload.single('zipFile'), // Single ZIP file upload
  activityLogger("order_media_image_video", (req, res) => res.locals.id),
  orderMediaPortalController.uploadZip
);

module.exports = router;
