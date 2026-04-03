const express = require("express");
const router = express.Router();

const assetMakesOfReportsController = require("../../controllers/orders/assetMakesOfReportsController");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity

// Apply authentication middleware to all routes
router.use(auth);

// GET /api/asset-makes-of-reports/:order_type/order-types - Get records by order type
router.get(
  "/:order_type/order-types",
  assetMakesOfReportsController.getByOrderType
);

// GET /api/asset-makes-of-reports/:id - Get record by ID
router.get(
  "/:id",
  assetMakesOfReportsController.getById
);

// POST /api/asset-makes-of-reports - Create new record
router.post(
  "/",
  checkPermission("add_order"), // Check permission to add records
  activityLogger("asset_makes_of_reports", (req, res) => res.locals.newRecordId), // Log creation
  assetMakesOfReportsController.create
);

module.exports = router;
