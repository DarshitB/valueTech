const express = require("express");
const router = express.Router();

const spreadsheetController = require("../../controllers/spreadsheets/spreadsheetController");
const auth = require("../../middleware/auth");

router.use(auth);

router.get("/", spreadsheetController.getAll);
router.post("/", spreadsheetController.create);
router.get("/:id", spreadsheetController.getById);
router.put("/:id", spreadsheetController.update);
router.delete("/:id", spreadsheetController.softDelete);
router.post("/:id/save", spreadsheetController.save);

module.exports = router;
