const express = require("express");
const router = express.Router();

const customReportController = require("../../controllers/orders/reports/customReportController");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity

// Apply authentication middleware to all routes
router.use(auth);

/**
 * POST /api/orders-reports/custom-report/generate
 * Generate custom report with PDF - handles everything in one call
 * 
 * Body: {
 *   "order_id": 123,
 *   "content": {
 *     "settings": {...},
 *     "pages": {...}
 *   }
 * }
 * 
 * This endpoint will:
 * 1. Create the custom report in database
 * 2. Generate PDF from the content
 * 3. Store PDF file
 * 4. Create media document record
 * 5. Return success response with PDF URL
 */
router.post(
  "/generate",
  checkPermission("add_order_reports"), // Check permission to add order reports
  activityLogger("custom_reports", (req, res) => res.locals.newRecordId), // Log creation
  customReportController.generateReportWithPDF
);

module.exports = router;
