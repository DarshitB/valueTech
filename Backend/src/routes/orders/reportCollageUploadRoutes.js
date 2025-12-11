const express = require("express");
const router = express.Router();
const reportCollageUploadController = require("../../controllers/orders/reportCollageUploadController");
const auth = require("../../middleware/auth");
const checkPermission = require("../../middleware/permission");
const activityLogger = require("../../middleware/activityLogger");

// Apply authentication middleware to all routes
router.use(auth);

/**
 * POST /api/orders-reports-collages/upload
 * Upload a single report or collage PDF file
 * 
 * Body (multipart/form-data):
 * - file: PDF file to upload (required)
 * - order_id: Order ID (required)
 * - type: "report" or "collage" (required)
 * 
 * Example using curl:
 * curl -X POST http://localhost:3000/api/orders-reports-collages/upload \
 *   -H "Authorization: Bearer YOUR_TOKEN" \
 *   -F "file=@/path/to/report.pdf" \
 *   -F "order_id=123" \
 *   -F "type=report"
 */
router.post(
  "/upload",
  checkPermission("add_order_reports"), // Check permission to add order reports
  activityLogger(
    "order_media_documents",
    (req, res) => res.locals.documentId,
    "Upload Report/Collage"
  ),
  reportCollageUploadController.upload
);

/**
 * POST /api/orders-reports-collages/upload-multiple
 * Upload multiple report or collage PDF files
 * 
 * Body (multipart/form-data):
 * - files: Array of PDF files to upload (required, max 10 files)
 * - order_id: Order ID (required)
 * - type: "report" or "collage" (required)
 * 
 * Example using curl:
 * curl -X POST http://localhost:3000/api/orders-reports-collages/upload-multiple \
 *   -H "Authorization: Bearer YOUR_TOKEN" \
 *   -F "files=@/path/to/report1.pdf" \
 *   -F "files=@/path/to/report2.pdf" \
 *   -F "order_id=123" \
 *   -F "type=report"
 */
router.post(
  "/upload-multiple",
  checkPermission("add_order_reports"), // Check permission to add order reports
  activityLogger(
    "order_media_documents",
    (req, res) => res.locals.documentId,
    "Upload Multiple Reports/Collages"
  ),
  reportCollageUploadController.uploadMultiple
);

module.exports = router;

