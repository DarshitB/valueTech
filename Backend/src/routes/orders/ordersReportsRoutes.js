const express = require("express");
const router = express.Router();

// In your backend routes
const multer = require("multer");
const upload = multer();

const reportController = require("../../controllers/orders/reports/reportController");
const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions

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
  reportController.saveReportData
);

module.exports = router;
