const express = require("express");
const router = express.Router();

const subcategoryController = require("../../controllers/category/subCategoryController");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Middleware to store old data before update
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity

// Apply authentication middleware to all routes
router.use(auth);

// GET all subcategories
router.get("/", subcategoryController.getAll);

// GET subcategory by ID
router.get("/:id", subcategoryController.getById);

// CREATE a subcategory
router.post(
  "/",
  checkPermission("add_sub_category"), // Check if user has permission to add subcategories
  activityLogger("sub_category", (req, res) => res.locals.newRecordId), // Log create activity
  subcategoryController.create
);

// UPDATE a subcategory by ID
router.put(
  "/:id",
  checkPermission("edit_sub_category"), // Check if user has permission to edit subcategories
  beforeUpdateLogger("sub_category", (req) => req.params.id), // Log old data before update
  activityLogger("sub_category", (req) => req.params.id), // Log update activity
  subcategoryController.update
);

// SOFT DELETE a subcategory by ID
router.delete(
  "/:id",
  checkPermission("delete_sub_category"), // Check if user has permission to delete subcategories
  activityLogger("sub_category", (req) => req.params.id), // Log delete activity
  subcategoryController.softDelete
);

module.exports = router;
