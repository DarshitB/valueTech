const express = require("express");
const router = express.Router();

const spreadsheetController = require("../../controllers/spreadsheets/spreadsheetController");
const auth = require("../../middleware/auth");
const checkPermission = require("../../middleware/permission");
const spreadsheetEditPermission = require("../../middleware/spreadsheetEditPermission");
const spreadsheetSavePermission = require("../../middleware/spreadsheetSavePermission");

router.use(auth);

router.get(
  "/",
  checkPermission("view_spreadsheet"),
  (req, res, next) => {
    if (String(req.query.archived || "").toLowerCase() !== "true") {
      return next();
    }
    return checkPermission("view_archive_spreadsheet")(req, res, next);
  },
  spreadsheetController.getAll
);
router.post("/", checkPermission("add_spreadsheet"), spreadsheetController.create);
router.post(
  "/:id/pin",
  checkPermission("view_spreadsheet"),
  spreadsheetController.pin
);
router.delete(
  "/:id/pin",
  checkPermission("view_spreadsheet"),
  spreadsheetController.unpin
);
router.post(
  "/:id/archive",
  checkPermission("create_archive_spreadsheet"),
  spreadsheetController.archive
);
router.delete(
  "/:id/archive",
  checkPermission("create_archive_spreadsheet"),
  spreadsheetController.unarchive
);
router.get("/:id", checkPermission("view_spreadsheet"), spreadsheetController.getById);
router.put("/:id", spreadsheetEditPermission(), spreadsheetController.update);
router.delete(
  "/:id",
  checkPermission("delete_spreadsheet"),
  spreadsheetController.softDelete
);
router.post("/:id/save", spreadsheetSavePermission(), spreadsheetController.save);

module.exports = router;
