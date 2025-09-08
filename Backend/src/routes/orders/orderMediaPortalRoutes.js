const express = require("express");
const router = express.Router();
const orderMediaPortalController = require("../../controllers/orders/orderMediaPortalController");
const auth = require("../../middleware/auth"); // Assuming you have auth middleware for portal
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Assuming you have before update logger middleware
const checkPermission = require("../../middleware/permission"); // Assuming you have permission middleware
const activityLogger = require("../../middleware/activityLogger"); // Assuming you have activity logger middleware
const permission = require("../../middleware/permission"); // Assuming you have permission middleware

// Apply authentication middleware to all routes
router.use(auth);

// Apply permission middleware if needed
// router.use(permission);

/**
 * GET /api/portal/order-media/:orderId
 * Get all media records for a specific order
 */
router.get(
  "/:orderId",
  checkPermission("view_order_media_files"),
  orderMediaPortalController.getOrderMedia
);

/**
 * GET /api/portal/order-media/:orderId/count
 * Get count of media records for a specific order
 */
router.get(
  "/:orderId/count",
  checkPermission("view_order_media_files"),
  orderMediaPortalController.getOrderMediaCount
);

/**
 * PATCH /api/portal/order-media/status
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

module.exports = router;
