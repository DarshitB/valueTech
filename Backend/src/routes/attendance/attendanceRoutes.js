const express = require("express");
const router = express.Router();

const attendanceController = require("../../controllers/attendance/attendanceController");

const auth = require("../../middleware/auth"); // Middleware to verify JWT token and user authentication
const checkPermission = require("../../middleware/permission");
const activityLogger = require("../../middleware/activityLogger");

// Apply authentication middleware to all attendance routes
router.use(auth);

// All users' attendance for one working date (Attendance Date page)
router.get(
  "/by-date/:workingDate",
  checkPermission("view_attendance_date_page"),
  attendanceController.getByWorkingDate
);

// Detail: one user + one working date
router.get(
  "/user/:userId/date/:workingDate",
  attendanceController.getDetailByUserAndDate
);

// Get all attendance records by user ID
router.get("/user/:userId", attendanceController.getByUserId);

// Get last attendance record for a user
router.get("/last/:userId", attendanceController.getLastRecord);

// Manual Day In / Day Out / Lunch In / Lunch Out edit
router.put(
  "/work-times",
  checkPermission("edit_users_time_stamp_attendance"),
  activityLogger(
    "attendance",
    (req, res) => res.locals.newRecordId,
    "update_work_times"
  ),
  attendanceController.updateWorkTimes
);

// Add/update day-out remarks (own attendance OR attendance_user_day_out_remark_update)
router.put(
  "/checkout-remarks",
  activityLogger(
    "attendance",
    (req, res) => res.locals.newRecordId,
    "update_checkout_remarks"
  ),
  attendanceController.updateCheckoutRemarks
);

// Create new attendance record
router.post("/", attendanceController.create);

// Update attendance record (for checkout)
router.put("/", attendanceController.update);

// Lunch in / lunch out on open attendance
router.put("/lunch-in", attendanceController.lunchIn);
router.put("/lunch-out", attendanceController.lunchOut);

// Personal break in (start) / break out (end) — multiple per day
router.put("/break-in", attendanceController.breakIn);
router.put("/break-out", attendanceController.breakOut);
router.get("/breaks/user/:userId", attendanceController.getBreaksByUserId);

// Manual Break In / Break Out timestamp edit (partial)
router.put(
  "/breaks/:id/work-times",
  checkPermission("edit_users_time_stamp_attendance"),
  activityLogger(
    "attendance_breaks",
    (req, res) => res.locals.newRecordId || req.params.id,
    "update_break_times"
  ),
  attendanceController.updateBreakTimes
);

module.exports = router;

