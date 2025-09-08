const express = require("express");
const router = express.Router();
const orderMediaDocumentController = require("../../controllers/orders/orderMediaDocumentController");
const auth = require("../../middleware/auth");
const checkPermission = require("../../middleware/permission");
const activityLogger = require("../../middleware/activityLogger");

// Apply authentication middleware to all routes
router.use(auth);

// Upload document
router.post(
  "/upload",
  checkPermission("add_order_media_documents"),
  activityLogger(
    "order_media_documents",
    (req, res) => res.locals.documentId,
    "Upload Media Documents"
  ),
  orderMediaDocumentController.upload
);

// Get documents by order ID (more specific route first)
router.get(
  "/:orderId",
  checkPermission("view_order_media_documents"),
  orderMediaDocumentController.getCollagesByOrderId
);

// Delete document (soft delete with activity log)
router.delete(
  "/:id",
  checkPermission("delete_order_media_documents"),
  activityLogger("order_media_documents", (req) => req.params.id),
  orderMediaDocumentController.delete
);

module.exports = router;
