const express = require("express");
const router = express.Router();

const orderController = require("../../controllers/orders/orderController");
const orderCommentRoutes = require("./orderCommentRoutes");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Middleware to store previous data before update
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity

// Apply authentication middleware to all routes
router.use(auth);

// Get all orders (excludes status 13 and 14 - use /finalized-and-on-hold-orders for those)
router.get("/", orderController.getAll);
// Get orders that are finalized (status 13) or on hold (status 14)
router.get("/finalized-and-on-hold-orders", orderController.getAllWithWoStatus);
router.get("/:orderId/last-mail", orderController.getLastMail);
router.get("/:id", orderController.getById);
router.post(
  "/",
  checkPermission("add_order"), // Check permission to add order
  activityLogger("orders", (req, res) => res.locals.newRecordId), // Log creation
  orderController.create
);
router.put(
  "/:id",
  checkPermission("edit_order"), // Check permission to edit order
  beforeUpdateLogger("orders", (req) => req.params.id), // Store pre-update data
  activityLogger("orders", (req) => req.params.id), // Log update
  orderController.update
);
router.patch(
  "/:id/payment",
  checkPermission("edit_order"),
  beforeUpdateLogger("orders", (req) => req.params.id),
  activityLogger("orders", (req) => req.params.id),
  orderController.addingPayment
);
router.patch(
  "/:id/attributes",
  beforeUpdateLogger("orders", (req) => req.params.id), // Store pre-update data
  activityLogger("orders", (req) => req.params.id), // Log update
  orderController.updateOrderAttributes
);
router.patch(
  "/:id/update-status-under-review",
  checkPermission("view_order_complete_button"), // Check permission to edit order
  activityLogger("orders", (req) => req.params.id), // Log update
  orderController.updateStatusToUnderReview
);
router.patch(
  "/:id/update-status-after-under-review",
  checkPermission("view_order_authenticate_button"), // Check permission to edit order
  activityLogger("orders", (req) => req.params.id), // Log update
  orderController.updateOrderStatusAfterUnderReview
);
router.patch(
  "/:id/update-status-direct",
  checkPermission("edit_order"), // Direct status change
  activityLogger("orders", (req) => req.params.id), // Log update
  orderController.updateOrderStatusDirect
);
router.delete(
  "/:id",
  checkPermission("delete_order"), // Check permission to delete order
  activityLogger("orders", (req) => req.params.id), // Log deletion
  orderController.softDelete
);

// Send email with order documents
router.post(
  "/:orderId/send-mail",
  activityLogger("orders", (req) => req.params.orderId, "send_mail"), // Log send mail activity
  orderController.sendMail
);

// Nested routes for order comments (chat/comments)
router.use("/:orderId/comments", orderCommentRoutes);

module.exports = router;
