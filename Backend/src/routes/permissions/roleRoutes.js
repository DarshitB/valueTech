const express = require("express");
const router = express.Router();

const roleController = require("../../controllers/permissions/roleController");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Middleware to store old data on local temporary for add activity log
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity
const protectIfProtectedRole = require("../../middleware/protectIfProtectedRole"); // Middleware to protect routes for protected roles

router.use(auth); // Apply authentication middleware to all routes

router.get("/", roleController.getAll);
router.get("/:id", roleController.getById);
router.post(
  "/",
  checkPermission("add_role"),
  activityLogger("roles", (req, res) => res.locals.newRecordId),
  roleController.create
);
router.put(
  "/:id",
  protectIfProtectedRole,
  checkPermission("edit_role"),
  beforeUpdateLogger("roles", (req) => req.params.id),
  activityLogger("roles", (req) => req.params.id),
  roleController.update
);
router.delete(
  "/:id",
  protectIfProtectedRole,
  checkPermission("delete_role"),
  activityLogger("roles", (req) => req.params.id),
  roleController.softDelete
);

module.exports = router;
