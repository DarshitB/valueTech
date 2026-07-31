const express = require("express");
const router = express.Router();

const attendanceController = require("../../controllers/attendance/attendanceController");

const auth = require("../../middleware/auth"); // Middleware to verify JWT token and user authentication

// Apply authentication middleware to all attendance routes
router.use(auth);

// Get all attendance records by user ID
router.get("/user/:userId", attendanceController.getByUserId);

// Get last attendance record for a user
router.get("/last/:userId", attendanceController.getLastRecord);

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

module.exports = router;

