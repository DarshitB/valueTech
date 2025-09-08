const express = require("express");
const router = express.Router();

const childCategoryController = require("../../controllers/category/childCategoryController");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Middleware to store old data before update
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity

// Apply authentication middleware to all routes
router.use(auth);

router.get("/", childCategoryController.getAll);
router.get("/:id", childCategoryController.getById);
router.post(
  "/",
  checkPermission("add_child_category"), // Check if user has permission to add child categories
  activityLogger("child_category", (req, res) => res.locals.newRecordId), // Log create activity
  childCategoryController.create
);
router.put(
  "/:id",
  checkPermission("edit_child_category"), // Check if user has permission to edit child categories
  beforeUpdateLogger("child_category", (req) => req.params.id), // Log old data before update
  activityLogger("child_category", (req) => req.params.id), // Log update activity
  childCategoryController.update
);
router.delete(
  "/:id",
  checkPermission("delete_child_category"), // Check if user has permission to delete child categories
  activityLogger("child_category", (req) => req.params.id), // Log delete activity
  childCategoryController.softDelete
);

module.exports = router;
