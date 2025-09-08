const express = require("express");
const router = express.Router();

const userController = require("../../controllers/user/userController");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Middleware to store old data on local temporary for add activity log
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity
const protectIfProtectedRole = require("../../middleware/protectIfProtectedRole"); // Middleware to protect routes for protected roles

router.use(auth); // Apply authentication middleware to all routes

router.get("/", userController.getAll);
router.get("/:id", userController.getById);
router.post("/check-mobile", userController.findByMobile);
router.post("/check-email", userController.checkEmailExistence);
router.post(
  "/",
  checkPermission("add_user"), // Check if user has permission to add user
  activityLogger("users", (req, res) => res.locals.newRecordId),// Log creation activity
  userController.create
);
router.put(
  "/:id",
  protectIfProtectedRole,
  checkPermission("edit_user"), // Check if user has permission to edit user
  beforeUpdateLogger("users", (req) => req.params.id), // Store previous state before update
  activityLogger("users", (req) => req.params.id), // Log update activity
  userController.update
);
router.delete(
  "/:id",
  protectIfProtectedRole,
  checkPermission("delete_user"), // Check if user has permission to delete user
  activityLogger("users", (req) => req.params.id), // Log deletion activity
  userController.softDelete
);

module.exports = router;
