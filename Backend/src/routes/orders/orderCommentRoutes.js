const express = require("express");
const router = express.Router({ mergeParams: true });

const orderCommentController = require("../../controllers/orders/orderCommentController");
const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission");

// Apply authentication middleware to all routes
router.use(auth);

// Get all comments for an order
router.get(
  "/",
  checkPermission("view_order_comments"),
  orderCommentController.getByOrder
);

// Add a new comment to an order
router.post(
  "/",
  checkPermission("add_order_comments"),
  orderCommentController.create
);

module.exports = router;
