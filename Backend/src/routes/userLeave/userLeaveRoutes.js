const express = require("express");
const router = express.Router();

const userLeaveController = require("../../controllers/userLeave/userLeaveController");
const auth = require("../../middleware/auth");
const checkPermission = require("../../middleware/permission");
const activityLogger = require("../../middleware/activityLogger");

router.use(auth);

router.get("/user/:userId", userLeaveController.getByUserId);

router.post(
  "/",
  checkPermission("add_user_leave"),
  activityLogger("user_leaves", (req, res) => res.locals.newRecordId),
  userLeaveController.create
);

router.delete(
  "/:id",
  checkPermission("add_user_leave"),
  activityLogger("user_leaves", (req) => req.params.id),
  userLeaveController.softDelete
);

module.exports = router;
