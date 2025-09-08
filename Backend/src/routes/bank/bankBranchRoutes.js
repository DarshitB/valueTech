const express = require("express");
const router = express.Router();

const bankBranchController = require("../../controllers/bank/bankBranchController");

const auth = require("../../middleware/auth"); // Checks if user is authenticated
const checkPermission = require("../../middleware/permission"); // Checks if user has permission for the action
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Logs data before update for tracking changes
const activityLogger = require("../../middleware/activityLogger"); // Logs user activities in activity log

// Apply auth middleware to all branch routes
router.use(auth);

router.get("/", bankBranchController.getAll);
router.get("/:id", bankBranchController.getById);
router.post(
  "/",
  checkPermission("add_bank_branch"), // Checks if user has 'add_bank_branch' permission
  activityLogger("bank_branch", (req, res) => res.locals.newRecordId), // Log creation activity
  bankBranchController.create
);
router.put(
  "/:id",
  checkPermission("edit_bank_branch"), // Checks if user has 'edit_bank_branch' permission
  beforeUpdateLogger("bank_branch", (req) => req.params.id), // Store old data before update
  activityLogger("bank_branch", (req) => req.params.id), // Log update activity
  bankBranchController.update
);
router.delete(
  "/:id",
  checkPermission("delete_bank_branch"), // Checks if user has 'delete_bank_branch' permission
  activityLogger("bank_branch", (req) => req.params.id), // Log deletion activity
  bankBranchController.softDelete
);

module.exports = router;
