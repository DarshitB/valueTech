const express = require("express");
const router = express.Router();

const bankController = require("../../controllers/bank/bankController");

const auth = require("../../middleware/auth"); // Checks if user is authenticated
const checkPermission = require("../../middleware/permission"); // Checks if user has permission for the action
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Logs data before update for tracking changes
const activityLogger = require("../../middleware/activityLogger"); // Logs user activities in activity log

// Apply auth middleware to all bank routes
router.use(auth);

router.get("/", bankController.getAll);
router.get("/:id", bankController.getById);
router.post(
  "/",
  checkPermission("add_bank"), // Checks if user has 'add_banks' permission
  activityLogger("bank", (req, res) => res.locals.newRecordId), // Log creation activity
  bankController.create
);
router.put(
  "/:id",
  checkPermission("edit_bank"), // Checks if user has 'edit_banks' permission
  beforeUpdateLogger("bank", (req) => req.params.id), // Store previous state before update
  activityLogger("bank", (req) => req.params.id), // Log update activity
  bankController.update
);
router.delete(
  "/:id",
  checkPermission("delete_bank"), // Checks if user has 'delete_banks' permission
  activityLogger("bank", (req) => req.params.id), // Log deletion activity
  bankController.softDelete
);

module.exports = router;
