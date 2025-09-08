const express = require("express");
const router = express.Router();

const fieldVerifierController = require("../../controllers/fieldVerifier/portalOperationsController");

const auth = require("../../middleware/auth"); // Middleware to verify JWT token and user authentication
const checkPermission = require("../../middleware/permission"); // Middleware to verify user has required permission
const beforeUpdateLogger = require("../../middleware/beforeUpdateLogger"); // Middleware to store old data before update for logging
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user's activity (create, update, delete)

// Apply authentication middleware to all field verifier routes
router.use(auth);

/* ------------------------ FIELD VERIFIER ROUTES ------------------------ */

router.get("/", fieldVerifierController.getAll);
router.get("/:id", fieldVerifierController.getById);
router.post("/check-username", fieldVerifierController.checkUsernameExistence);
router.post("/check-mobile", fieldVerifierController.findByMobile);
router.post(
  "/",
  checkPermission("add_field_verifier"), // Check if user has permission to add
  activityLogger("field_verifiers", (req, res) => res.locals.newRecordId), // Log create activity
  fieldVerifierController.create
);
router.put(
  "/:id",
  checkPermission("edit_field_verifier"), // Check if user has permission to edit
  beforeUpdateLogger("field_verifiers", (req) => req.params.id), // Log old data before update
  activityLogger("field_verifiers", (req) => req.params.id), // Log update activity
  fieldVerifierController.update
);
router.patch(
  "/:id/toggle-status",
  checkPermission("edit_field_verifier"), // Check if user has permission to edit
  beforeUpdateLogger("field_verifiers", (req) => req.params.id), // Log old data before update
  activityLogger("field_verifiers", (req) => req.params.id, "update Status"), // Log update activity
  fieldVerifierController.toggleActiveStatus
);
router.delete(
  "/:id",
  checkPermission("delete_field_verifier"), // Check if user has permission to delete
  activityLogger("field_verifiers", (req) => req.params.id), // Log delete activity
  fieldVerifierController.softDelete
);

/* ------------------------ FIELD VERIFIER LOGIN ROUTES ------------------------ */

router.get("/logins/all", fieldVerifierController.getAllLogins);
router.get("/logins/:id", fieldVerifierController.getLoginById);
router.delete(
  "/logins/:id",
  checkPermission("delete_field_verifier_login"), // Permission to delete login record
  activityLogger("field_verifier_logins", (req) => req.params.id), // Log login delete
  fieldVerifierController.softDeleteLogin
);

module.exports = router;
