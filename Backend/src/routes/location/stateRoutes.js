const express = require("express");
const router = express.Router();

const stateController = require("../../controllers/location/stateController");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Middleware to store old data on local temporary for add activity log
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity

router.use(auth); // Apply authentication middleware to all routes

// e.g. add middleware like auth or permission here if needed
router.get("/", stateController.getAll);
router.get("/:id", stateController.getById);
router.post(
  "/",
  checkPermission("add_state"),
  activityLogger("states", (req, res) => res.locals.newRecordId),
  stateController.create
);
router.put(
  "/:id",
  checkPermission("edit_state"),
  beforeUpdateLogger("states", (req) => req.params.id),
  activityLogger("states", (req) => req.params.id),
  stateController.update
);
router.delete(
  "/:id",
  checkPermission("delete_state"),
  activityLogger("states", (req) => req.params.id),
  stateController.softDelete
);

module.exports = router;
