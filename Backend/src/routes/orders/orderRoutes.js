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
router.get("/by-order-number/:orderNumber", orderController.getByOrderNumber);
router.get("/statuses", orderController.getAllStatuses);
router.get(
  "/by-registration",
  orderController.searchByRegistrationNumber
);
// Get finalized orders by child category (status 13 only)
router.get(
  "/child-category/:child_category_id/finalized",
  orderController.getByChildCategoryWithFinalizedStatus
);
router.get("/:orderId/last-mail", orderController.getLastMail);
router.get("/:id/r2-sync-status", orderController.getR2SyncStatus);
router.post(
  "/:id/r2-sync",
  checkPermission("view_order_r2_sync_button"),
  activityLogger("orders", (req) => req.params.id, "r2_sync"),
  orderController.startR2Sync
);
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
  // Dashboard Status button: edit_order_status_db
  // Order Details complete/hold/etc: edit_order
  async (req, res, next) => {
    try {
      const { PROTECTED_ROLE } = require("../../constants/protectedRoles");
      const {
        roleHasPermission,
      } = require("../../services/spreadsheets/spreadsheetAccessPolicy");
      const { role_id, role_name } = req.user || {};
      if (role_name === PROTECTED_ROLE) return next();
      const allowed =
        (await roleHasPermission(role_id, "edit_order_status_db")) ||
        (await roleHasPermission(role_id, "edit_order"));
      if (!allowed) {
        return res
          .status(403)
          .json({ message: "Forbidden: You lack this permission" });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  },
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
