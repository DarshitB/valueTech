const express = require("express");
const router = express.Router();

const holidayController = require("../../controllers/holiday/holidayController");
const auth = require("../../middleware/auth");
const checkPermission = require("../../middleware/permission");
const activityLogger = require("../../middleware/activityLogger");

router.use(auth);

router.get("/", holidayController.getAll);

router.post(
  "/",
  checkPermission("add_company_holiday"),
  activityLogger("holidays", (req, res) => res.locals.newRecordId),
  holidayController.create
);

router.delete(
  "/:id",
  checkPermission("add_company_holiday"),
  activityLogger("holidays", (req) => req.params.id),
  holidayController.softDelete
);

module.exports = router;
