const express = require("express");
const router = express.Router();

const spreadsheetController = require("../../controllers/spreadsheets/spreadsheetController");
const auth = require("../../middleware/auth");

router.use(auth);

router.get("/", spreadsheetController.getAll);
router.get("/:id", spreadsheetController.getById);
router.post("/:id/save", spreadsheetController.save);
router.post("/", spreadsheetController.create);

module.exports = router;
