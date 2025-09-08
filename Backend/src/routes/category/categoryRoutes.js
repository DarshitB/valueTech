const express = require("express");
const router = express.Router();

const categoryController = require("../../controllers/category/categoryController");

const auth = require("../../middleware/auth"); // Middleware to verify JWT token and user authentication
const checkPermission = require("../../middleware/permission"); // Middleware to verify user has required permission
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Middleware to store old data before update for logging
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user's activity (create, update, delete)

// Apply authentication middleware to all category routes
router.use(auth);


router.get("/", categoryController.getAll);
router.get("/:id", categoryController.getById);
router.post(
  "/",
  checkPermission("add_category"), // Check if user has permission to add categories
  activityLogger("category", (req, res) => res.locals.newRecordId), // Log create action with new record ID
  categoryController.create
);
router.put(
  "/:id",
  checkPermission("edit_category"), // Check if user has permission to edit categories
  beforeUpdateLogger("category", (req) => req.params.id), // Log old data before update
  activityLogger("category", (req) => req.params.id), // Log update activity
  categoryController.update
);
router.delete(
  "/:id",
  checkPermission("delete_category"), // Check if user has permission to delete categories
  activityLogger("category", (req) => req.params.id), // Log delete activity
  categoryController.softDelete
);

module.exports = router;
