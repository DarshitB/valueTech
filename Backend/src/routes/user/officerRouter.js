const express = require("express");
const router = express.Router();

const officerController = require("../../controllers/user/officerController");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Middleware to store previous data before update
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity

// Apply authentication middleware to all routes
router.use(auth);

router.get("/", officerController.getAll);
router.get("/:id", officerController.getById);
router.post(
  "/",
  checkPermission("add_branch_officer"), // Check permission to add officer
  activityLogger("officers", (req, res) => res.locals.newRecordId), // Log creation
  officerController.create
);
router.put(
  "/:id",
  checkPermission("edit_branch_officer"), // Check permission to edit
  beforeUpdateLogger("officers", (req) => req.params.id), // Store pre-update data
  activityLogger("officers", (req) => req.params.id), // Log update
  officerController.update
);
router.delete(
  "/:id",
  checkPermission("delete_branch_officer"), // Check permission
  activityLogger("officers", (req) => req.params.id), // Log deletion
  officerController.softDelete
);

module.exports = router;
