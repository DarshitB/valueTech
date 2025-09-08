const express = require("express");
const router = express.Router();

const controller = require("../../controllers/permissions/permissionController");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity
const protectIfProtectedRole = require("../../middleware/protectIfProtectedRole"); // Middleware to protect routes for protected roles

router.use(auth); // Apply authentication middleware to all routes

// Optional: Add checkPermission('manage_permissions') if you want restriction
router.get("/all", controller.getAllPermissions);
router.get(
  "/role-wise",
  checkPermission("view_permission"),
  controller.getAllRolePermissions
);
router.put(
  "/role-bulk",
  protectIfProtectedRole,
  checkPermission("edit_permission"),
  activityLogger("role_permissions", () => null),
  controller.updateAllRolePermissions
);
router.post(
  "/",
  activityLogger("permission", (req, res) => res.locals.newRecordId),
  controller.create
);

module.exports = router;
