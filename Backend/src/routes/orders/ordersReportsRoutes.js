const express = require("express");
const router = express.Router();

// In your backend routes
const multer = require("multer");
const upload = multer();

const reportController = require("../../controllers/orders/reports/reportController");
const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity

// Apply authentication middleware to all routes
router.use(auth);

/**
 * GET /orders-reports/:order_id/:report_type
 * Get specific report by order ID and report type
 *
 * Example: GET /orders-reports/123/report_cv
 */
router.get(
  "/:order_id/:report_type",
  /* checkPermission("view_order_reports"), */ // Check permission to view order reports
  reportController.getReportByOrderAndType
);

/**
 * GET /orders-reports/child-category/:child_category_id/:report_type
 * Get last report by child category ID and report type
 * Returns the most recent report (by created_at) for the given child_category_id and report_type
 *
 * Example: GET /orders-reports/child-category/5/report_cv
 */
router.get(
  "/child-category/:child_category_id/:report_type",
  /* checkPermission("view_order_reports"), */ // Check permission to view order reports
  reportController.getReportByChildCategoryAndType
);

/**
 * POST /orders-reports/:order_id/generate
 * Generate report PDF
 *
 * Example: POST /orders-reports/123/generate
 */
router.post(
  "/:order_id/generate",
  /* checkPermission("add_order_reports"), */ // Check permission to add order reports
  reportController.uploadChassisImage, // Handle file upload for chassis impression
  reportController.generateReport
);

/**
 * POST /orders-reports/:order_id/save
 * Save report data step by step (allows partial data)
 * Works exactly like generate but saves data without creating PDF
 *
 * Example: POST /orders-reports/123/save
 */
router.post(
  "/:order_id/save",
  upload.any(),
  /* checkPermission("save_order_reports"), */ // Check permission to add order reports
  activityLogger("orders", (req) => req.params.order_id, "report details saved"), // Log report save activity
  reportController.saveReportData
);

module.exports = router;
